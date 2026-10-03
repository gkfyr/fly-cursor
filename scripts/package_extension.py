"""Build the unpacked extension archive without data, caches or private keys."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[1]
FILES = ['manifest.json', 'background.js', 'content.js', 'popup.html',
         'popup.css', 'popup.js', 'README.md']

def main():
    output = ROOT / 'dist' / 'fly-cursor-extension.zip'
    output.parent.mkdir(exist_ok=True)
    with ZipFile(output, 'w', ZIP_DEFLATED) as archive:
        for name in FILES:
            archive.write(ROOT / 'extension' / name, 'extension/' + name)
        for name in ['LICENSE', 'THIRD_PARTY_NOTICES.md']:
            archive.write(ROOT / name, 'extension/' + name)
    print(output)

if __name__ == '__main__':
    main()
