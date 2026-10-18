"""Package gmail-accent for distribution.

Produces, in dist/:
  gmail-accent-<version>.xpi   signed-addon payload (an .xpi is a zip)
  gmail-accent-<version>.zip   same bytes, for Chrome/Edge/Brave stores

An UNSIGNED .xpi still trips Firefox's "has not been verified" check. It is only
installable permanently once signed by AMO (unlisted signing is free and automated).
Until then: about:debugging -> Load Temporary Add-on -> pick manifest.json.

Usage: python build_release.py
"""
import json
import os
import zipfile

ROOT = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(ROOT, "dist")
SKIP_DIRS = {".git", "dist", "node_modules", "__pycache__", "test"}
SKIP_FILES = {".gitignore", "build_release.py", "README.md"}

with open(os.path.join(ROOT, "manifest.json"), encoding="utf-8") as fh:
    manifest = json.load(fh)
version = manifest["version"]

# Every file the manifest actually references, plus anything else shipped by design.
required = [manifest["action"]["default_popup"], manifest["options_ui"]["page"]]
required += list(manifest["icons"].values())
for cs in manifest["content_scripts"]:
    required += cs.get("js", []) + cs.get("css", [])
required.append("manifest.json")

missing = [r for r in required if not os.path.exists(os.path.join(ROOT, r))]
if missing:
    raise SystemExit("manifest references missing files: %s" % missing)

os.makedirs(DIST, exist_ok=True)
base = "gmail-accent-%s" % version

for ext in ("xpi", "zip"):
    out = os.path.join(DIST, "%s.%s" % (base, ext))
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
        for dirpath, dirnames, filenames in os.walk(ROOT):
            dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
            for name in sorted(filenames):
                if name in SKIP_FILES:
                    continue
                full = os.path.join(dirpath, name)
                rel = os.path.relpath(full, ROOT).replace("\\", "/")
                if rel.startswith("dist/"):
                    continue
                zf.write(full, rel)
    print("%s  %d bytes" % (out, os.path.getsize(out)))
    with zipfile.ZipFile(out) as zf:
        names = zf.namelist()
        print("   %d entries: %s" % (len(names), ", ".join(sorted(names))))
