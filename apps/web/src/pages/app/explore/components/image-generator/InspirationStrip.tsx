import type { ImageModeCard } from "./constants";
import { ModeGallery } from "./ModeGallery";

type Props = {
  items: readonly ImageModeCard[];
  disabled?: boolean;
  onSelect: (card: ImageModeCard, file?: File) => void;
};

export function InspirationStrip({ items, disabled = false, onSelect }: Props) {
  return <ModeGallery cards={items} disabled={disabled} onLaunch={onSelect} />;
}
