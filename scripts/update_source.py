#!/usr/bin/env python3
"""Merge a new release's build info into an AltStore source.json.

Mirrors what the Nectar project's release pipeline does with its own
update_source.py (see kyrielie/nectar's release.yml, publish-source job):
start from appstore/source.template.json, layer in an existing
source.json's prior "versions" history if one was passed in, and
prepend a new version entry built from this run's env/CLI inputs.

This copy is new for noteblock-pianola -- the Nectar script's actual
internals were not available to reference, so the version-entry shape
below is derived directly from the AltStore source format
(https://faq.altstore.io/altstore-ios/altsource-format) rather than
copied from Nectar's implementation. Verify field names against that
spec if AltStore's schema has changed since.

Usage:
    python3 scripts/update_source.py \
        --template=appstore/source.template.json \
        --existing=appstore/source.json \
        --output=appstore/source.json \
        --version=1.2.0 \
        --build-version=1.42 \
        --date=2026-08-29T12:00:00Z \
        --notes="Release notes for this version" \
        --download-url=https://github.com/.../NoteblockPianola-unsigned.ipa \
        --size-bytes=12345678 \
        --min-os-version=15.0
"""
import argparse
import json
import sys


def parse_args():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--template", required=True, help="Path to source.template.json")
    p.add_argument("--existing", default=None, help="Path to prior source.json, if any")
    p.add_argument("--output", required=True, help="Where to write the merged source.json")
    p.add_argument("--version", required=True, help="Marketing version, e.g. 1.2.0")
    p.add_argument("--build-version", required=True, help="Build/CURRENT_PROJECT_VERSION-derived string")
    p.add_argument("--date", required=True, help="ISO 8601 release date")
    p.add_argument("--notes", default="", help="Release notes / localizedDescription for this version")
    p.add_argument("--download-url", required=True, help="Direct download URL for the .ipa")
    p.add_argument("--size-bytes", required=True, type=int, help="Size of the .ipa in bytes")
    p.add_argument("--min-os-version", required=True, help="Minimum iOS version, e.g. 15.0")
    return p.parse_args()


def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def existing_versions_by_app(existing, bundle_identifier):
    """Pull the prior "versions" array for a given app out of an existing source.json."""
    if existing is None:
        return []
    for app in existing.get("apps", []):
        if app.get("bundleIdentifier") == bundle_identifier:
            return app.get("versions", [])
    return []


def main():
    args = parse_args()

    source = load_json(args.template)
    existing = load_json(args.existing) if args.existing else None

    if not source.get("apps"):
        print("error: template has no apps[] entries", file=sys.stderr)
        return 1

    new_version_entry = {
        "version": args.version,
        "buildVersion": args.build_version,
        "date": args.date,
        "localizedDescription": args.notes,
        "downloadURL": args.download_url,
        "size": args.size_bytes,
        "minOSVersion": args.min_os_version,
    }

    for app in source["apps"]:
        bundle_id = app["bundleIdentifier"]
        prior_versions = existing_versions_by_app(existing, bundle_id)

        # De-dupe: if this exact version+buildVersion was already published
        # (e.g. re-running publish-source on a `release: edited` event to
        # pick up hand-edited notes, without a rebuild), replace that entry
        # in place instead of prepending a duplicate.
        prior_versions = [
            v
            for v in prior_versions
            if not (
                v.get("version") == new_version_entry["version"]
                and v.get("buildVersion") == new_version_entry["buildVersion"]
            )
        ]

        app["versions"] = [new_version_entry] + prior_versions
        # AltStore also reads top-level version/versionDate/downloadURL/size
        # on the app entry itself as a convenience mirror of versions[0].
        app["version"] = new_version_entry["version"]
        app["versionDate"] = new_version_entry["date"]
        app["versionDescription"] = new_version_entry["localizedDescription"]
        app["downloadURL"] = new_version_entry["downloadURL"]
        app["size"] = new_version_entry["size"]

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(source, f, indent=4)
        f.write("\n")

    return 0


if __name__ == "__main__":
    sys.exit(main())
