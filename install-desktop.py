#!/usr/bin/env python3
"""Install only the Desktop half locally, without secrets, sudo or network."""
import argparse
import hashlib
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--home', type=Path, default=Path.home() / '.hermes', help='App-level Hermes home on the Desktop machine (not a remote gateway/profile).')
    args = parser.parse_args()
    source = Path(__file__).resolve().parent / 'desktop' / 'plugin.js'
    dest = args.home / 'desktop-plugins' / 'composio-connections' / 'plugin.js'
    data = source.read_bytes()
    if dest.is_symlink() or dest.parent.is_symlink():
        parser.error('Refusing a symlink installation target.')
    if dest.exists():
        if dest.read_bytes() != data:
            parser.error('A different plugin already exists. Back it up and resolve the update explicitly.')
    else:
        dest.parent.mkdir(parents=True, exist_ok=True)
        # Exclusive creation refuses concurrent replacement of an existing file.
        with dest.open('xb') as stream:
            stream.write(data)
    if dest.read_bytes() != data:
        parser.error('Installed file verification failed.')
    print(f'Desktop file installed and verified: {dest}')
    print('SHA256: ' + hashlib.sha256(data).hexdigest())
    print('This verifies file delivery, not native rendering. Open Composio in Hermes Desktop to verify loading.')


if __name__ == '__main__':
    main()
