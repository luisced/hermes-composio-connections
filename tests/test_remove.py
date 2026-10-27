import asyncio
import pytest
from test_cli import binary

def test_exact_prompt_confirms_only_selected_account(tmp_path,monkeypatch):
    from dashboard.cli import run_remove
    marker=tmp_path/'answer'
    binary(tmp_path,monkeypatch,f'import sys\nprint("Toolkit: gmail\\nWord Id: gmail_exact\\nRemove gmail connection?",flush=True)\nanswer=sys.stdin.readline()\nopen({str(marker)!r},"w").write(answer)\n')
    asyncio.run(run_remove('gmail_exact','gmail',timeout=2))
    assert marker.read_text().strip()=='y'

@pytest.mark.parametrize('prompt',['Remove everything?', 'Toolkit: gmail\nWord Id: gmail_other\nRemove gmail connection?'])
def test_unknown_prompt_fails_closed(tmp_path,monkeypatch,prompt):
    from dashboard.cli import run_remove, ComposioError
    marker=tmp_path/'answer'
    binary(tmp_path,monkeypatch,f'import sys\nprint({prompt!r},flush=True)\nanswer=sys.stdin.readline()\nopen({str(marker)!r},"w").write(answer)\n')
    with pytest.raises(ComposioError): asyncio.run(run_remove('gmail_exact','gmail',timeout=.2))
    assert not marker.exists()
