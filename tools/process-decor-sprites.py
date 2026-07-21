from pathlib import Path
import sys

from PIL import Image


def process(source: Path, destination: Path) -> None:
    image = Image.open(source).convert("RGBA")
    bounds = image.getchannel("A").getbbox()
    if bounds is None:
        raise ValueError(f"{source} has an empty alpha channel")

    image = image.crop(bounds)
    image.thumbnail((220, 220), Image.Resampling.LANCZOS)
    output = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
    output.alpha_composite(image, ((256 - image.width) // 2, (256 - image.height) // 2))
    output.save(destination, optimize=True)

    alpha = output.getchannel("A")
    corners = [alpha.getpixel(point) for point in ((0, 0), (255, 0), (0, 255), (255, 255))]
    if alpha.getextrema() != (0, 255) or corners != [0, 0, 0, 0]:
        raise ValueError(f"{destination} failed transparency validation")
    print(f"Wrote {destination} ({destination.stat().st_size} bytes), alpha bounds {alpha.getbbox()}")


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: process-decor-sprites.py SOURCE_DIR OUTPUT_DIR")
    source_directory = Path(sys.argv[1])
    output_directory = Path(sys.argv[2])
    output_directory.mkdir(parents=True, exist_ok=True)
    for name in ("lantern", "radio", "toolbox", "fern"):
        process(source_directory / f"{name}-full.png", output_directory / f"{name}.png")


if __name__ == "__main__":
    main()
