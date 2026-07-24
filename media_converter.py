# HOW TO USE:
# Run the script, input either:
#   - A folder path (same as before), OR
#   - A comma-separated list of file names.
#
# If a file name doesn't includein a path and isn't found in the current folder,
# the script will also look in your Downloads folder.
#
# It can:
#   - Convert all PNGs to WEBP (keeping the original PNGs)
#   - Convert all MP3s to OGG (keeping the original MP3s)
#   - Or do both at once, recursively for folders or directly for specific files.

from PIL import Image
from pathlib import Path
import subprocess
import shutil
# ----------------------------
# PNG -> WEBP IMAGE CONVERSION
# ----------------------------



def png_to_webp(png_path: Path, quality: int = 90) -> None:
    """Convert a single PNG file to WEBP (non-destructive)."""
    webp_path = png_path.with_suffix(".webp")

    with Image.open(png_path) as img:
        img.save(webp_path, "webp", quality=quality)

    print(f"[IMG] Converted: {png_path} -> {webp_path}")


def convert_png_folder(folder: Path, recursive: bool = False, quality: int = 90) -> None:
    """Convert all PNG files in a folder (optionally recursively) to WEBP."""
    if not folder.exists():
        print(f"[IMG] Folder does not exist: {folder}")
        return

    pattern = "**/*.png" if recursive else "*.png"
    png_files = list(folder.glob(pattern))

    if not png_files:
        print("[IMG] No PNG files found.")
        return

    print(f"[IMG] Found {len(png_files)} PNG file(s) in {folder}")
    for png in png_files:
        png_to_webp(png, quality=quality)


# ----------------------------
# MP3 -> OGG AUDIO CONVERSION
# ----------------------------

def ensure_ffmpeg_available() -> bool:
    """Check if ffmpeg is available on the system PATH."""
    return shutil.which("ffmpeg") is not None


def mp3_to_ogg(mp3_path: Path, quality: int = 5) -> None:
    """
    Convert a single MP3 file to OGG (non-destructive).

    Uses ffmpeg with VBR quality (qscale:a).
    Typical quality range is 0–10 (0 = best, 10 = worst).
    Default 5 ~ mid-range quality/size.
    """
    ogg_path = mp3_path.with_suffix(".ogg")

    # ffmpeg command:
    #   ffmpeg -y -i input.mp3 -acodec libvorbis -qscale:a QUALITY output.ogg
    cmd = [
        "ffmpeg",
        "-y",                # overwrite output if it already exists
        "-i", str(mp3_path),
        "-acodec", "libvorbis",
        "-qscale:a", str(quality),
        str(ogg_path),
    ]

    try:
        result = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            check=False,
        )
    except FileNotFoundError:
        print("[AUDIO] ERROR: ffmpeg not found. Please install ffmpeg and ensure it is on your PATH.")
        return

    if result.returncode != 0:
        print(f"[AUDIO] ERROR converting {mp3_path} to OGG:")
        # Show a short snippet of stderr to help debug
        print(result.stderr.splitlines()[-1] if result.stderr else "Unknown error.")
        return

    print(f"[AUDIO] Converted: {mp3_path} -> {ogg_path}")


def convert_mp3_folder(folder: Path, recursive: bool = False, quality: int = 5) -> None:
    """Convert all MP3 files in a folder (optionally recursively) to OGG."""
    if not folder.exists():
        print(f"[AUDIO] Folder does not exist: {folder}")
        return

    if not ensure_ffmpeg_available():
        print("[AUDIO] ERROR: ffmpeg is not installed or not on PATH.")
        print("        Install ffmpeg and run this script again.")
        return

    pattern = "**/*.mp3" if recursive else "*.mp3"
    mp3_files = list(folder.glob(pattern))

    if not mp3_files:
        print("[AUDIO] No MP3 files found.")
        return

    print(f"[AUDIO] Found {len(mp3_files)} MP3 file(s) in {folder}")
    for mp3 in mp3_files:
        mp3_to_ogg(mp3, quality=quality)


# ----------------------------
# HELPERS FOR DIRECT FILE LIST
# ----------------------------

def resolve_file_list(raw_text: str) -> list[Path]:
    """
    Interpret user input as a comma-separated list of files.
    If a file doesn't exist as written, also try ~/Downloads/<name>.
    """
    downloads_dir = Path.home() / "Downloads"
    names = [s.strip() for s in raw_text.split(",") if s.strip()]
    files: list[Path] = []

    if not names:
        return files

    for name in names:
        candidate = Path(name)

        # If the path as given exists, use it
        if candidate.exists():
            files.append(candidate)
            continue

        # If it's not absolute, also try Downloads
        if not candidate.is_absolute():
            dl_candidate = downloads_dir / name
            if dl_candidate.exists():
                files.append(dl_candidate)
                continue

        print(f"[WARN] Could not find file '{name}' "
              f"(tried '{candidate}' and '{downloads_dir / name}')")

    return files


def convert_png_file_list(files: list[Path], quality: int = 90) -> None:
    pngs = [f for f in files if f.suffix.lower() == ".png"]
    if not pngs:
        print("[IMG] No PNG files in the provided list.")
        return

    print(f"[IMG] Converting {len(pngs)} PNG file(s)...")
    for png in pngs:
        png_to_webp(png, quality=quality)


def convert_mp3_file_list(files: list[Path], quality: int = 5) -> None:
    mp3s = [f for f in files if f.suffix.lower() == ".mp3"]
    if not mp3s:
        print("[AUDIO] No MP3 files in the provided list.")
        return

    if not ensure_ffmpeg_available():
        print("[AUDIO] ERROR: ffmpeg is not installed or not on PATH.")
        print("        Install ffmpeg and run this script again.")
        return

    print(f"[AUDIO] Converting {len(mp3s)} MP3 file(s)...")
    for mp3 in mp3s:
        mp3_to_ogg(mp3, quality=quality)


# ----------------------------
# MAIN ENTRY POINT
# ----------------------------

if __name__ == "__main__":
    # Ask user for folder OR file names.
    # - If this matches an existing folder, we use folder mode.
    # - Otherwise, it's treated as a comma-separated list of file names.
    prompt = (
        "Enter a folder path to scan for media\n"
        "OR a comma-separated list of file names "
        "(names without a path will be looked for in your Downloads folder).\n"
        "Leave blank to use the current folder: "
    )
    user_text = input(prompt).strip()

    folder_path: Path | None = None
    files_to_convert: list[Path] | None = None

    if not user_text:
        # Default: current working directory (same as original behavior)
        folder_path = Path.cwd()
    else:
        candidate = Path(user_text)
        if candidate.exists() and candidate.is_dir():
            # Treat as a folder, same as before
            folder_path = candidate
        else:
            # Treat input as list of files
            files_to_convert = resolve_file_list(user_text)
            if not files_to_convert:
                print("No valid files found. Exiting.")
                raise SystemExit(1)

    # Choose what to convert
    mode = input(
        "Convert (i)mages [PNG->WEBP], (a)udio [MP3->OGG], or (b)oth? [i/a/b, default=b]: "
    ).strip().lower()

    if mode not in {"i", "a", "b", ""}:
        print("Invalid choice. Use 'i', 'a', or 'b'.")
        raise SystemExit(1)

    # Recursive conversion for folder mode (keeps prior behavior)
    recursive = True

    # Folder-based conversion (original behavior, still supported)
    if folder_path is not None:
        if not folder_path.exists():
            print(f"Folder does not exist: {folder_path}")
            raise SystemExit(1)

        if mode in {"i", "b", ""}:
            convert_png_folder(folder_path, recursive=recursive, quality=90)

        if mode in {"a", "b", ""}:
            # quality=5 is a reasonable default for OGG VBR
            convert_mp3_folder(folder_path, recursive=recursive, quality=5)

    # File-list-based conversion (new behavior)
    if files_to_convert is not None:
        if mode in {"i", "b", ""}:
            convert_png_file_list(files_to_convert, quality=90)

        if mode in {"a", "b", ""}:
            convert_mp3_file_list(files_to_convert, quality=5)