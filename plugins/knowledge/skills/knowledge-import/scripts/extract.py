#!/usr/bin/env python3
"""
Extract text from a document file for knowledge-import processing.

The extraction implementation is vendored from book-to-skill. This wrapper
keeps the package beside the entrypoint so the skill is self-contained.
"""

import os
import sys

# Force UTF-8 stdout/stderr so extracted text, the attribution line's separators
# and the dependency-check glyphs (✓ / ✗) don't raise UnicodeEncodeError on Windows
# consoles that default to a legacy code page (e.g. GBK / cp936).
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass

# The vendored ``book_to_skill`` package lives next to this file.
sys.path.insert(0, str(os.path.dirname(os.path.abspath(__file__))))

from book_to_skill.cli import main

if __name__ == "__main__":
    main()
