"""Regression pin for CFG-05: Docker/docker-compose.yml shipped one
environment line (DB_ADMIN_PASSWORD) dedented to column 0, which makes
the file invalid YAML for any conformant parser, and read SECRET_KEY
from ${APP_SECRET_KEY:-} — a variable name no shipped env example
defines (both examples and the root compose file use SECRET_KEY), so
installs silently fell back to the generated, non-persisting key path.

Kept dependency-free (no yaml import: PyYAML is not a project
dependency); the full YAML parse is verified separately in the QA
environment.
"""
import os
import re

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def test_docker_compose_env_indentation_and_secret_var():
    with open(os.path.join(REPO_ROOT, "Docker/docker-compose.yml"),
              encoding="utf-8") as fh:
        lines = fh.read().splitlines()
    env_lines = [
        line for line in lines if re.match(r"^\s*- [A-Z_]+=", line)
    ]
    assert env_lines, "no environment entries found"
    indents = {len(line) - len(line.lstrip(" ")) for line in env_lines}
    assert indents == {6}, (
        f"environment entries must share one indent: {indents}")
    src = "\n".join(lines)
    assert "SECRET_KEY=${SECRET_KEY:-}" in src
    assert "APP_SECRET_KEY" not in src
