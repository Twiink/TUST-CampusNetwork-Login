#!/usr/bin/env python3
"""Read PE imports without executing the product; reject external VC runtimes."""
import argparse
from pathlib import Path
import struct


def imports(path):
    data = path.read_bytes()
    if data[:2] != b'MZ':
        raise ValueError('Missing DOS header')
    pe = struct.unpack_from('<I', data, 0x3c)[0]
    if data[pe:pe + 4] != b'PE\0\0':
        raise ValueError('Missing PE header')
    sections = struct.unpack_from('<H', data, pe + 6)[0]
    optional_size = struct.unpack_from('<H', data, pe + 20)[0]
    optional = pe + 24
    if struct.unpack_from('<H', data, optional)[0] != 0x20b:
        raise ValueError('Expected a 64-bit Windows binary')
    tables = optional + optional_size

    def offset(rva):
        for index in range(sections):
            virtual_size, address, raw_size, raw = struct.unpack_from('<4I', data, tables + index * 40 + 8)
            if address <= rva < address + max(virtual_size, raw_size):
                return raw + rva - address
        raise ValueError(f'Unmapped RVA {rva}')

    rva, _ = struct.unpack_from('<2I', data, optional + 112 + 8)
    if not rva:
        raise ValueError('Expected Windows system imports')
    descriptor = offset(rva)
    names = []
    while any(data[descriptor:descriptor + 20]):
        name = offset(struct.unpack_from('<I', data, descriptor + 12)[0])
        names.append(data[name:data.index(b'\0', name)].decode('ascii').lower())
        descriptor += 20
    return names


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('binaries', type=Path)
    args = parser.parse_args()
    for name in ('netmate-agent.exe', 'netmate-ui.exe'):
        names = imports(args.binaries / name)
        external = [name for name in names if name.startswith(('vcruntime', 'msvcp', 'concrt', 'msvcr'))]
        if external:
            raise SystemExit(f'{name} still requires separately distributed runtimes: {external}')
        print(f'{name}: system DLL imports only; VC runtime is statically linked')


if __name__ == '__main__':
    main()
