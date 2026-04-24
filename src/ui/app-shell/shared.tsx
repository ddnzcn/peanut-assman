import type { ProjectDocument, SliceAsset, TilesetTileAsset } from "../../types";

export function TileAssetPreview({
  project,
  tile,
  scale: forcedScale,
}: {
  project: ProjectDocument;
  tile: TilesetTileAsset | null;
  scale?: number;
}) {
  if (!tile) {
    return <div className="tile-preview empty" />;
  }
  const slice = project.slices.find((entry) => entry.id === tile.sliceId) ?? null;
  return <SliceAssetPreview project={project} slice={slice} scale={forcedScale} />;
}

export function SliceAssetPreview({
  project,
  slice,
  scale: forcedScale,
}: {
  project: ProjectDocument;
  slice: SliceAsset | null;
  scale?: number;
}) {
  if (!slice) {
    return <div className="tile-preview empty" />;
  }
  const source = project.sourceImages.find((entry) => entry.id === slice.sourceImageId) ?? null;
  if (!source) {
    return <div className="tile-preview empty" />;
  }
  const scale =
    forcedScale ??
    Math.max(
      1,
      Math.floor(Math.min(88 / Math.max(1, slice.sourceRect.width), 88 / Math.max(1, slice.sourceRect.height))),
    );
  return (
    <div className="tile-preview">
      <div
        className="tile-preview-image"
        style={{
          width: slice.sourceRect.width * scale,
          height: slice.sourceRect.height * scale,
          backgroundImage: `url(${source.dataUrl})`,
          backgroundPosition: `-${slice.sourceRect.x * scale}px -${slice.sourceRect.y * scale}px`,
          backgroundSize: `${source.width * scale}px ${source.height * scale}px`,
        }}
      />
    </div>
  );
}

