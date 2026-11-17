import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch


SCRIPTS = Path(__file__).parents[1] / "skills" / "knowledge-import" / "scripts"
sys.path.insert(0, str(SCRIPTS))

from book_to_skill.parsers.pdf import clean_pdftotext  # noqa: E402
from book_to_skill.utils import detect_structure  # noqa: E402


class CoursePageMarkersTest(unittest.TestCase):
    def test_page_markers_preserve_physical_page_numbers(self):
        raw = "Header\nAlpha\n1\fHeader\nBeta\n2\fHeader\nGamma\n3\f"

        with patch.dict(os.environ, {"COURSE_PRESERVE_PAGE_MARKERS": "1"}):
            cleaned = clean_pdftotext(raw)

        self.assertIn("<!-- source-page: 1 -->\nAlpha", cleaned)
        self.assertIn("<!-- source-page: 3 -->\nGamma", cleaned)
        self.assertNotIn("source-page: 4", cleaned)

    def test_default_output_remains_upstream_compatible(self):
        raw = "Header\nAlpha\n1\fHeader\nBeta\n2\fHeader\nGamma\n3\f"

        with patch.dict(os.environ, {}, clear=True):
            cleaned = clean_pdftotext(raw)

        self.assertNotIn("source-page", cleaned)
        self.assertIn("Alpha", cleaned)


class ChapterDetectionTest(unittest.TestCase):
    def test_explicit_chapters_beat_page_number_running_headers(self):
        text = "\n".join(
            [
                "Chapter 1",
                "2                                Chapter 1. Introduction",
                "Chapter 2",
                "121                              Chapter 2. Distributions",
            ]
        )

        structure = detect_structure(text)

        self.assertEqual(2, structure["chapters_detected"])
        self.assertEqual("numeric", structure["chapters_method"])


if __name__ == "__main__":
    unittest.main()
