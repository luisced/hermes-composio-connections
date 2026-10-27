import subprocess
import sys
from pathlib import Path

ROOT=Path(__file__).parents[1]

def test_desktop_installer_copies_only_plugin_and_is_idempotent(tmp_path):
    home=tmp_path/'app-home'
    def install():
        return subprocess.run([sys.executable,str(ROOT/'install-desktop.py'),'--home',str(home)],capture_output=True,text=True)
    first=install()
    assert first.returncode==0,first.stderr
    dest=home/'desktop-plugins/composio-connections/plugin.js'
    assert dest.read_bytes()==(ROOT/'desktop/plugin.js').read_bytes()
    assert install().returncode==0
    assert sorted(str(p.relative_to(home)) for p in home.rglob('*') if p.is_file())==['desktop-plugins/composio-connections/plugin.js']

def test_desktop_installer_refuses_overwriting_different_plugin(tmp_path):
    dest=tmp_path/'desktop-plugins/composio-connections/plugin.js'
    dest.parent.mkdir(parents=True); dest.write_text('existing local version')
    result=subprocess.run([sys.executable,str(ROOT/'install-desktop.py'),'--home',str(tmp_path)],capture_output=True,text=True)
    assert result.returncode!=0
    assert 'already exists' in result.stderr
    assert dest.read_text()=='existing local version'
