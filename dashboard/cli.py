"""Bounded, secret-safe CLI execution. No shell or caller-supplied executable."""
import asyncio
import os
import signal
import pty
import re

MAX_OUTPUT = 2_000_000

class ComposioError(Exception):
    def __init__(self, code):
        self.code = code
        super().__init__(code)

async def run_cli(args: list[str], *, stdin: str | None = None, timeout: float = 30) -> str:
    try:
        proc = await asyncio.create_subprocess_exec(
            'composio', *args, stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
            start_new_session=True,
        )
    except FileNotFoundError:
        raise ComposioError('cli-missing') from None
    async def read(stream):
        chunks = []
        size = 0
        while chunk := await stream.read(65536):
            size += len(chunk)
            if size > MAX_OUTPUT:
                # A paused pipe must be drained before subprocess.wait can finish.
                try: os.killpg(proc.pid, signal.SIGKILL)
                except ProcessLookupError: pass
                while await stream.read(65536):
                    pass
                raise ComposioError('size-limit')
            chunks.append(chunk)
        return b''.join(chunks)
    async def exchange():
        if stdin is not None:
            proc.stdin.write(stdin.encode())
            await proc.stdin.drain()
        proc.stdin.close()
        out, err = await asyncio.gather(read(proc.stdout), read(proc.stderr))
        await proc.wait()
        if proc.returncode:
            # Inspect only for classification, never expose upstream text.
            low = (out + err).lower()
            code = 'auth-required' if any(x in low for x in (b'not logged in', b'please login', b'not authenticated')) else 'cli-error'
            raise ComposioError(code)
        try:
            return out.decode('utf-8')
        except UnicodeDecodeError:
            raise ComposioError('invalid-output') from None
    try:
        return await asyncio.wait_for(exchange(), timeout)
    except TimeoutError:
        raise ComposioError('timeout') from None
    finally:
        # Descendants may outlive the leader and hold inherited pipes open.
        try: os.killpg(proc.pid, signal.SIGKILL)
        except ProcessLookupError: pass
        async def discard(stream):
            while await stream.read(65536): pass
        try:
            await asyncio.wait_for(asyncio.gather(discard(proc.stdout), discard(proc.stderr), proc.wait()), 2)
        except TimeoutError:
            raise ComposioError('timeout') from None

async def run_remove(selector: str, toolkit: str, *, timeout: float = 30) -> None:
    """Answer only the inspected Composio prompt after verifying its account note."""
    master, slave = pty.openpty()
    proc = None
    loop = asyncio.get_running_loop()
    finished = loop.create_future()
    captured = bytearray()
    answered = False
    answer_timer = None
    def fail_protocol():
        if not finished.done(): finished.set_exception(ComposioError('prompt-changed'))
    def confirm_active_prompt():
        nonlocal answered
        if answered or finished.done(): return
        text = re.sub(r'\x1b\[[0-?]*[ -/]*[@-~]', '', captured.decode('utf-8', 'replace'))
        prompt = f'Remove {toolkit} connection?'
        # Never answer an earlier question in a transcript. Only the one
        # active question, followed by the known Clack Yes/No chrome, is valid.
        if text.count('?') != 1 or text.count(prompt) != 1:
            fail_protocol(); return
        note, tail = text.split(prompt)
        account = re.search(r'(?:Word Id|Connected Account):\s*' + re.escape(selector) + r'(?=\s|$)', note)
        correct_toolkit = re.search(r'Toolkit:\s*' + re.escape(toolkit) + r'(?=\s|$)', note)
        chrome = re.sub(r'[\s│┃◇◆┌┐└┘─●○◉◯/]', '', tail)
        if not account or not correct_toolkit or chrome not in ('', 'YesNo', 'NoYes'):
            fail_protocol(); return
        os.write(master, b'y\r')
        answered = True
    def readable():
        nonlocal answer_timer
        try:
            chunk = os.read(master, 65536)
        except OSError:
            chunk = b''
        if not chunk:
            loop.remove_reader(master)
            if not finished.done(): finished.set_result(None)
            return
        captured.extend(chunk)
        if len(captured) > MAX_OUTPUT:
            loop.remove_reader(master)
            if not finished.done(): finished.set_exception(ComposioError('size-limit'))
            return
        if answer_timer is not None: answer_timer.cancel()
        if not answered and b'?' in captured:
            # Let one terminal rendering settle; additional output restarts
            # validation rather than matching historical prompt substrings.
            answer_timer = loop.call_later(.06, confirm_active_prompt)
    try:
        try:
            proc = await asyncio.create_subprocess_exec('composio', 'connections', 'remove', selector,
                stdin=slave, stdout=slave, stderr=slave, start_new_session=True)
        except FileNotFoundError:
            raise ComposioError('cli-missing') from None
        os.close(slave); slave = -1
        loop.add_reader(master, readable)
        await asyncio.wait_for(finished, timeout)
        await asyncio.wait_for(proc.wait(), 2)
        if not answered: raise ComposioError('prompt-changed')
        if proc.returncode: raise ComposioError('cli-error')
    except TimeoutError:
        raise ComposioError('prompt-changed' if not answered else 'timeout') from None
    finally:
        if answer_timer is not None: answer_timer.cancel()
        loop.remove_reader(master)
        if proc is not None:
            try: os.killpg(proc.pid, signal.SIGKILL)
            except ProcessLookupError: pass
            await asyncio.wait_for(proc.wait(), 2)
        os.close(master)
        if slave != -1: os.close(slave)
