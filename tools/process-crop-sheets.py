from __future__ import annotations

import argparse
from collections import deque
from pathlib import Path

from PIL import Image


def remove_neighbor_fragments(frame: Image.Image) -> Image.Image:
    alpha = frame.getchannel("A")
    width, height = frame.size
    visible = bytearray(1 if value > 16 else 0 for value in alpha.tobytes())
    visited = bytearray(width * height)
    components: list[tuple[list[int], bool]] = []
    for start, value in enumerate(visible):
        if not value or visited[start]:
            continue
        queue = deque([start])
        visited[start] = 1
        component: list[int] = []
        touches_edge = False
        while queue:
            index = queue.popleft()
            component.append(index)
            x, y = index % width, index // width
            touches_edge = touches_edge or x < 6 or x >= width - 6
            for neighbor in (index - 1, index + 1, index - width, index + width):
                if neighbor < 0 or neighbor >= width * height or visited[neighbor] or not visible[neighbor]:
                    continue
                nx, ny = neighbor % width, neighbor // width
                if abs(nx - x) + abs(ny - y) != 1:
                    continue
                visited[neighbor] = 1
                queue.append(neighbor)
        components.append((component, touches_edge))
    remove = bytearray(width * height)
    largest = max((len(component) for component, _ in components), default=0)
    for component, touches_edge in components:
        if touches_edge and len(component) < largest * 0.25:
            for index in component:
                remove[index] = 1
    alpha_data = bytearray(alpha.tobytes())
    for index, value in enumerate(remove):
        if value:
            alpha_data[index] = 0
    frame.putalpha(Image.frombytes("L", frame.size, bytes(alpha_data)))
    return frame


def export_frames(sheet_path: Path, output_dir: Path) -> None:
    crop_id = sheet_path.stem.removesuffix("-growth-alpha")
    sheet = Image.open(sheet_path).convert("RGBA")
    frame_width = sheet.width // 4
    output_dir.mkdir(parents=True, exist_ok=True)

    for stage in range(4):
        left = stage * frame_width
        right = sheet.width if stage == 3 else (stage + 1) * frame_width
        frame = remove_neighbor_fragments(sheet.crop((left, 0, right, sheet.height)))
        alpha_box = frame.getchannel("A").getbbox()
        if alpha_box is None:
            raise ValueError(f"{sheet_path.name} stage {stage} has no visible pixels")
        subject = frame.crop(alpha_box)
        subject.thumbnail((232, 220), Image.Resampling.LANCZOS)
        canvas = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
        canvas.alpha_composite(subject, ((256 - subject.width) // 2, (256 - subject.height) // 2))
        target = output_dir / f"{crop_id}-{stage}.png"
        canvas.save(target, optimize=True)
        if canvas.getpixel((0, 0))[3] != 0:
            raise ValueError(f"{target.name} does not have a transparent corner")


def main() -> None:
    parser = argparse.ArgumentParser(description="Split four-column GPT crop sheets into runtime sprites")
    parser.add_argument("input_dir", type=Path)
    parser.add_argument("output_dir", type=Path)
    args = parser.parse_args()
    sheets = sorted(args.input_dir.glob("*-growth-alpha.png"))
    if not sheets:
        raise SystemExit("No *-growth-alpha.png sheets found")
    for sheet in sheets:
        export_frames(sheet, args.output_dir)


if __name__ == "__main__":
    main()
