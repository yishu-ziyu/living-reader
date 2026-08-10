"use client";

import { useCallback, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  isWalkableCell,
  resolveCurrentPlaceId,
  resolveWalkSprite,
  sortDrawablesByDepth,
  WALK_SPRITE,
  WALK_SPRITE_DIR,
  type WalkCell,
  type WalkDrawable,
  type WalkPresentation,
} from "@/modules/world";
import styles from "./walk-view.module.css";

const KEY_DELTA: Record<string, WalkCell> = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  w: { x: 0, y: -1 },
  s: { x: 0, y: 1 },
  a: { x: -1, y: 0 },
  d: { x: 1, y: 0 },
};

/** Anchor cell -> CSS box whose bottom edge rests on that cell's bottom line. */
function boxStyle(
  anchor: WalkCell,
  cols: number,
  rows: number,
  spriteCols: number,
  spriteRows: number,
): CSSProperties {
  const cellW = 100 / cols;
  const cellH = 100 / rows;
  return {
    left: `${(anchor.x + 0.5) * cellW - (spriteCols * cellW) / 2}%`,
    top: `${(anchor.y + 1) * cellH - spriteRows * cellH}%`,
    inlineSize: `${spriteCols * cellW}%`,
    blockSize: `${spriteRows * cellH}%`,
    zIndex: anchor.y * 2 + 1,
  };
}

export function WalkView({
  walk,
  placeHeaderId = "walk-current-place",
}: {
  walk: WalkPresentation;
  placeHeaderId?: string;
}) {
  const [avatarCell, setAvatarCell] = useState<WalkCell>(walk.avatar.cell);
  const [blockedReason, setBlockedReason] = useState<string | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const currentPlaceId = resolveCurrentPlaceId(avatarCell, walk.places);
  const currentPlace =
    walk.places.find((place) => place.id === currentPlaceId) ?? null;

  const scenery = useMemo(
    () => sortDrawablesByDepth(walk.drawables),
    [walk.drawables],
  );

  const blockerCells = useMemo(() => {
    const cells: WalkCell[] = [];
    for (let y = 0; y < walk.map.rows; y += 1) {
      for (let x = 0; x < walk.map.cols; x += 1) {
        if (walk.map.blockers[y * walk.map.cols + x] === 1) cells.push({ x, y });
      }
    }
    return cells;
  }, [walk.map]);

  // A locked place is by definition unreachable, so it can never earn a focus
  // label. It has to read as locked while the reader stands somewhere else.
  const lockedPlaceAt = useCallback(
    (anchor: WalkCell) =>
      walk.places.find(
        (place) =>
          place.status === "locked" &&
          place.entrance.x === anchor.x &&
          place.entrance.y === anchor.y,
      ) ?? null,
    [walk.places],
  );

  const move = useCallback(
    (delta: WalkCell) => {
      const next = { x: avatarCell.x + delta.x, y: avatarCell.y + delta.y };
      if (isWalkableCell(walk, next)) {
        setAvatarCell(next);
        setBlockedReason(null);
        return;
      }
      const lockedPlace = walk.places.find(
        (place) =>
          place.status === "locked" &&
          place.entrance.x === next.x &&
          place.entrance.y === next.y,
      );
      setBlockedReason(
        lockedPlace?.locked_reason ?? "这边走不过去，前面是建筑或镇子边界。",
      );
    },
    [avatarCell, walk],
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const delta = KEY_DELTA[event.key] ?? KEY_DELTA[event.key.toLowerCase()];
      if (!delta) return;
      event.preventDefault();
      move(delta);
    },
    [move],
  );

  const avatarSprite = WALK_SPRITE["avatar-reader"]!;

  return (
    <section
      aria-label="可走世界场景"
      className={styles.shell}
      data-testid="walk-view"
    >
      <header className={styles.placeHeader}>
        <div>
          <p className={styles.placeKicker}>EXECUTABLE WORLD · WOOL TOWN</p>
          <h3 data-testid="walk-current-place" id={placeHeaderId}>
            {currentPlace ? currentPlace.label : "镇外空地"}
          </h3>
          <p
            aria-live="polite"
            className={styles.placeMeta}
            data-avatar-x={avatarCell.x}
            data-avatar-y={avatarCell.y}
            data-current-place-id={currentPlaceId ?? ""}
            data-testid="walk-avatar-cell"
          >
            化身 {avatarCell.x},{avatarCell.y}
            {currentPlace ? ` · 已到达${currentPlace.label}` : " · 还没靠近任何地点"}
          </p>
        </div>
        {blockedReason ? (
          <p
            aria-live="polite"
            className={styles.blockedNote}
            data-testid="walk-blocked-reason"
            role="status"
          >
            {blockedReason}
          </p>
        ) : null}
      </header>

      <div
        aria-describedby={placeHeaderId}
        aria-label="用方向键或 WASD 在镇上走动"
        className={styles.stage}
        data-testid="walk-grid"
        onKeyDown={onKeyDown}
        ref={stageRef}
        role="application"
        style={
          {
            "--walk-cols": walk.map.cols,
            "--walk-rows": walk.map.rows,
          } as CSSProperties
        }
        tabIndex={0}
      >
        {blockerCells.map((cell) => (
          <span
            aria-hidden="true"
            className={styles.blocker}
            key={`blocker-${cell.x}-${cell.y}`}
            style={{
              left: `${(cell.x * 100) / walk.map.cols}%`,
              top: `${(cell.y * 100) / walk.map.rows}%`,
            }}
          />
        ))}

        {scenery.map((drawable: WalkDrawable) => {
          const sprite = resolveWalkSprite(drawable.sprite_ref);
          const lockedPlace = lockedPlaceAt(drawable.anchor);
          const focused =
            currentPlace !== null &&
            (drawable.id === `building-${currentPlace.id}` ||
              drawable.id === `building-${currentPlace.id}-stall` ||
              drawable.id === `building-${currentPlace.id}-fence` ||
              drawable.id === `building-${currentPlace.id}-gate`);
          return (
            <div
              className={styles.drawable}
              data-drawable-id={drawable.id}
              data-focused={focused ? "true" : "false"}
              data-kind={drawable.kind}
              data-locked={lockedPlace ? "true" : "false"}
              data-testid={`walk-drawable-${drawable.id}`}
              key={drawable.id}
              style={boxStyle(
                drawable.anchor,
                walk.map.cols,
                walk.map.rows,
                sprite.cols,
                sprite.rows,
              )}
            >
              {focused ? (
                <span className={styles.focusLabel}>{sprite.label}</span>
              ) : null}
              {lockedPlace ? (
                <span
                  className={styles.lockedMarker}
                  data-testid={`walk-locked-marker-${lockedPlace.id}`}
                >
                  锁
                </span>
              ) : null}
              <img
                alt=""
                aria-hidden="true"
                className={styles.sprite}
                src={`${WALK_SPRITE_DIR}/${sprite.src}`}
              />
            </div>
          );
        })}

        <div
          className={`${styles.drawable} ${styles.avatar}`}
          data-kind="avatar"
          data-testid="walk-avatar"
          style={{
            ...boxStyle(
              avatarCell,
              walk.map.cols,
              walk.map.rows,
              avatarSprite.cols,
              avatarSprite.rows,
            ),
            zIndex: avatarCell.y * 2 + 2,
          }}
        >
          <span className={styles.focusLabel}>{avatarSprite.label}</span>
          <img
            alt=""
            aria-hidden="true"
            className={styles.sprite}
            src={`${WALK_SPRITE_DIR}/${avatarSprite.src}`}
          />
          <span aria-hidden="true" className={styles.avatarRing} />
        </div>
      </div>

      <p className={styles.hint}>
        点一下画面，然后用 <kbd>↑</kbd> <kbd>↓</kbd> <kbd>←</kbd> <kbd>→</kbd> 或{" "}
        <kbd>WASD</kbd> 走动。走到门口就算到达，不用点下面的列表。
      </p>

      {/* Secondary legend only: never the primary way to change "where I am". */}
      <ul className={styles.legend} data-testid="walk-place-legend">
        {walk.places.map((place) => (
          <li
            data-current={place.id === currentPlaceId ? "true" : "false"}
            data-place-id={place.id}
            data-status={place.status}
            key={place.id}
          >
            <strong>{place.label}</strong>
            <span>
              {place.status === "locked"
                ? place.locked_reason ?? "锁定"
                : `入口 ${place.entrance.x},${place.entrance.y}`}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
