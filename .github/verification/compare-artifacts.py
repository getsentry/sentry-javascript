import hashlib, json, os, sys, tarfile
from pathlib import Path

def digest(data):
    return hashlib.sha256(data).hexdigest()

def manifest():
    result = {}
    for root in ['packages', 'dev-packages']:
        for archive in sorted(Path(root).glob('*/*.tgz')):
            entries = {}
            with tarfile.open(archive, 'r:gz') as tar:
                for member in tar:
                    if member.isdir():
                        continue
                    if member.name in entries:
                        raise RuntimeError(f'Duplicate archive entry: {archive}:{member.name}')
                    entries[member.name] = {'type': member.type.decode(), 'mode': member.mode,
                        'link': member.linkname, 'sha256': digest(tar.extractfile(member).read()) if member.isfile() else None}
            result[str(archive)] = entries
        for bundle in sorted(Path(root).glob('*/build/bundles/**/*')):
            if bundle.is_file():
                result[str(bundle)] = {'sha256': digest(bundle.read_bytes())}
    if not result:
        raise RuntimeError('No outputs found')
    return result

actual = manifest()
if sys.argv[1] == 'write':
    Path(sys.argv[2]).write_text(json.dumps(actual, sort_keys=True))
    print(f'Central outputs: {len(actual)} archives/bundle files')
else:
    expected = json.loads(Path(sys.argv[2]).read_text())
    failures = []
    for name, entries in actual.items():
        if name not in expected:
            failures.append(f'Unexpected output: {name}')
        elif expected[name] != entries:
            failures.append(f'Different output: {name}')
            if name.endswith('.tgz'):
                for f in sorted(set(entries) | set(expected[name])):
                    if entries.get(f) != expected[name].get(f):
                        failures.append(f'  {f}: {expected[name].get(f)} -> {entries.get(f)}')
    report = {'outputs_compared': len(actual), 'tarballs_compared': sum(x.endswith('.tgz') for x in actual),
              'bundle_files_compared': sum('/build/bundles/' in x for x in actual), 'differences': failures}
    Path('comparison.json').write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))
    if failures:
        sys.exit(1)
