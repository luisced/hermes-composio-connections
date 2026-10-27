import asyncio
import os
import pytest

# Fake upstream processes replace only the external executable; the runner is real.
def binary(tmp_path, monkeypatch, body):
    p=tmp_path/'composio'
    p.write_text('#!/usr/bin/env python3\n'+body)
    p.chmod(0o755)
    monkeypatch.setenv('PATH', str(tmp_path)+':'+os.environ['PATH'])
    return p

def test_cli_timeout_kills_process(tmp_path,monkeypatch):
    from dashboard.cli import run_cli, ComposioError
    pid=tmp_path/'pid'
    binary(tmp_path,monkeypatch,f'import os,time\nopen({str(pid)!r},"w").write(str(os.getpid()))\ntime.sleep(30)\n')
    with pytest.raises(ComposioError,match='timeout'):
        asyncio.run(run_cli(['connections','list'],timeout=.2))
    with pytest.raises(ProcessLookupError): os.kill(int(pid.read_text()),0)

def test_cli_errors_do_not_echo_secrets(tmp_path,monkeypatch):
    from dashboard.cli import run_cli, ComposioError
    binary(tmp_path,monkeypatch,'import sys\nprint("secret-value",file=sys.stderr)\nsys.exit(1)\n')
    with pytest.raises(ComposioError) as e: asyncio.run(run_cli(['connections','list']))
    assert 'secret-value' not in str(e.value)

def test_cli_limits_output(tmp_path,monkeypatch):
    from dashboard.cli import run_cli, ComposioError
    binary(tmp_path,monkeypatch,'print("x"*3000000)\n')
    with pytest.raises(ComposioError,match='size-limit'): asyncio.run(run_cli(['connections','list']))

def test_cli_missing(monkeypatch):
    from dashboard.cli import run_cli, ComposioError
    monkeypatch.setenv('PATH','/nonexistent')
    with pytest.raises(ComposioError,match='cli-missing'): asyncio.run(run_cli(['connections','list']))
