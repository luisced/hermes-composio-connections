import asyncio
import os
import signal
import time
import pytest
from test_cli import binary

def test_old_prompt_followed_by_unexpected_question_never_confirms(tmp_path,monkeypatch):
    from dashboard.cli import run_remove, ComposioError
    marker=tmp_path/'answer'
    text='Toolkit: gmail\nWord Id: gmail_exact\nRemove gmail connection?\nContract changed: confirm REMOVE ALL connections?'
    binary(tmp_path,monkeypatch,f'import sys\nprint({text!r},flush=True)\na=sys.stdin.readline()\nopen({str(marker)!r},"w").write(a)\n')
    with pytest.raises(ComposioError): asyncio.run(run_remove('gmail_exact','gmail',timeout=.3))
    assert not marker.exists()

@pytest.mark.parametrize('kind',['read','remove'])
def test_timeout_kills_descendants_after_leader_exits(tmp_path,monkeypatch,kind):
    from dashboard.cli import run_cli,run_remove,ComposioError
    marker=tmp_path/'survived'; group=tmp_path/'group'
    script=f'import os,time\nopen({str(group)!r},"w").write(str(os.getpid()))\nif os.fork(): os._exit(0)\ntime.sleep(.65)\nopen({str(marker)!r},"w").write("alive")\nos._exit(0)\n'
    binary(tmp_path,monkeypatch,script)
    try:
        with pytest.raises(ComposioError):
            asyncio.run(run_cli(['connections','list'],timeout=.15) if kind=='read' else run_remove('gmail_exact','gmail',timeout=.15))
        time.sleep(.7)
        assert not marker.exists(), 'descendant survived operation timeout'
    finally:
        if group.exists():
            try: os.killpg(int(group.read_text()),signal.SIGKILL)
            except ProcessLookupError: pass
