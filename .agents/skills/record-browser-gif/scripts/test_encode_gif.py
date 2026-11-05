"""Exercise the shipped encoder with real media, including decoded GIF pixels."""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ENCODER = Path(__file__).with_name("encode_gif.py")
MEDIA_AVAILABLE = shutil.which("ffmpeg") is not None and shutil.which("ffprobe") is not None


@unittest.skipUnless(MEDIA_AVAILABLE, "ffmpeg and ffprobe are required for real media evidence")
class EncoderConsumerTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory(prefix="gif-consumer-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.frames = self.root / "frames"
        self.frames.mkdir()
        self.write_frame("00.ppm", 64, 32, (255, 0, 0))
        self.write_frame("01.ppm", 64, 32, (0, 0, 255))
        self.output = self.root / "demo.gif"

    def write_frame(self, name: str, width: int, height: int, rgb: tuple[int, int, int]) -> None:
        (self.frames / name).write_bytes(
            f"P6\n{width} {height}\n255\n".encode("ascii") + bytes(rgb) * width * height
        )

    def encode(self, *arguments: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(ENCODER), *arguments], capture_output=True, text=True, check=False,
        )

    def screenshot_arguments(self) -> list[str]:
        return [str(self.frames), str(self.output), "--pattern", "*.ppm", "--fps", "4", "--durations", "1,2"]

    def test_screenshot_order_dimensions_and_final_hold_survive_encoding(self) -> None:
        result = self.encode(*self.screenshot_arguments())
        self.assertEqual(result.returncode, 0, result.stderr)
        summary = json.loads(result.stdout)
        self.assertEqual((summary["width"], summary["height"]), (64, 32))
        self.assertEqual(summary["sourceFrames"], 2)
        self.assertGreaterEqual(summary["encodedFrames"], 2)
        self.assertAlmostEqual(summary["durationSeconds"], 3, delta=0.5)
        self.assertEqual(summary["bytes"], self.output.stat().st_size)
        # Decode the artifact, not the source screenshots: palette conversion and
        # timing must preserve the red initial state and the blue settled state.
        decoded = subprocess.run(
            ["ffmpeg", "-v", "error", "-i", str(self.output), "-vf", "fps=4", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"],
            capture_output=True, check=True,
        ).stdout
        stride = 64 * 32 * 3
        self.assertGreaterEqual(len(decoded), stride * 2)
        first = decoded[:3]
        last = decoded[-stride:-stride + 3]
        self.assertGreater(first[0], first[2] + 100)
        self.assertGreater(last[2], last[0] + 100)

    def test_continuous_video_trim_speed_and_hold(self) -> None:
        video = self.root / "input.mkv"
        subprocess.run(
            ["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "testsrc2=size=64x32:rate=8:duration=3", "-c:v", "ffv1", str(video)],
            check=True, capture_output=True,
        )
        result = self.encode(str(video), str(self.output), "--start", "0.5", "--end", "2.5", "--speed", "2", "--final-hold", "1", "--fps", "4")
        self.assertEqual(result.returncode, 0, result.stderr)
        summary = json.loads(result.stdout)
        self.assertEqual((summary["startSeconds"], summary["endSeconds"], summary["speed"]), (0.5, 2.5, 2))
        self.assertAlmostEqual(summary["durationSeconds"], 2, delta=0.5)
        self.assertGreaterEqual(summary["encodedFrames"], 2)

    def test_mixed_mode_and_mismatched_dimensions_reject_without_output(self) -> None:
        mixed = self.encode(*self.screenshot_arguments(), "--speed", "2")
        self.assertNotEqual(mixed.returncode, 0)
        self.assertIn("require a video", mixed.stderr)
        self.assertFalse(self.output.exists())
        self.write_frame("01.ppm", 32, 32, (0, 0, 255))
        mismatch = self.encode(*self.screenshot_arguments())
        self.assertNotEqual(mismatch.returncode, 0)
        self.assertIn("identical dimensions", mismatch.stderr)
        self.assertFalse(self.output.exists())

    def test_existing_artifact_is_never_overwritten_implicitly(self) -> None:
        self.output.write_bytes(b"existing-user-artifact")
        result = self.encode(*self.screenshot_arguments())
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("already exists", result.stderr)
        self.assertEqual(self.output.read_bytes(), b"existing-user-artifact")

    def test_frame_count_duration_and_palette_are_validated(self) -> None:
        (self.frames / "01.ppm").unlink()
        result = self.encode(*self.screenshot_arguments())
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("at least two frames", result.stderr)
        self.assertFalse(self.output.exists())
        self.write_frame("01.ppm", 64, 32, (0, 0, 255))
        for option, value, message in [("--durations", "1,2,3", "values for 2 frames"), ("--colors", "3", "between 4 and 256"), ("--fps", "31", "must not exceed 30")]:
            with self.subTest(option=option):
                result = self.encode(*self.screenshot_arguments(), option, value)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn(message, result.stderr)
                self.assertFalse(self.output.exists())


if __name__ == "__main__":
    unittest.main()
