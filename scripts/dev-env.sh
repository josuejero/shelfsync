#!/usr/bin/env bash

script_path=""
if [[ -n "${BASH_SOURCE[0]-}" ]]; then
  script_path="${BASH_SOURCE[0]}"
elif [[ -n "${ZSH_VERSION-}" ]]; then
  script_path="${(%):-%x}"
else
  script_path="$0"
fi

is_sourced=false
if [[ -n "${BASH_SOURCE[0]-}" ]]; then
  [[ "${BASH_SOURCE[0]}" != "${0}" ]] && is_sourced=true
elif [[ -n "${ZSH_VERSION-}" ]]; then
  [[ "${ZSH_EVAL_CONTEXT-}" == *:file ]] && is_sourced=true
fi

saved_shell_opts=""
if [[ "$is_sourced" == true && -n "${BASH_VERSION-}" ]]; then
  saved_shell_opts="$(set +o)"
fi

if [[ -n "${ZSH_VERSION-}" ]]; then
  emulate -L sh
fi

set -euo pipefail

# Source this file to export API env vars into your shell.
ROOT_DIR="$(cd "$(dirname "$script_path")/.." && pwd)"
ENV_FILE="$ROOT_DIR/services/api/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  ENV_FILE="$ROOT_DIR/services/api/.env.example"
fi

env_file_exists=true
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file at services/api/.env or services/api/.env.example" >&2
  env_file_exists=false
fi

load_env() {
  local mode="${1:-export}"
  local line key value export_line

  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    [[ -z "$line" || "$line" == \#* ]] && continue
    [[ "$line" != *"="* ]] && continue

    key="${line%%=*}"
    value="${line#*=}"

    key="${key#export }"
    key="${key#"${key%%[![:space:]]*}"}"
    key="${key%"${key##*[![:space:]]}"}"
    [[ -z "$key" ]] && continue

    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"

    if [[ "$value" == \"*\" && "$value" == *\" ]]; then
      value="${value:1:-1}"
    elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
      value="${value:1:-1}"
    fi

    if [[ "$mode" == "print" ]]; then
      printf 'export %s=%q\n' "$key" "$value"
    else
      printf -v export_line 'export %s=%q' "$key" "$value"
      eval "$export_line"
    fi
  done < "$ENV_FILE"
}

usage() {
  cat <<'USAGE'
Usage:
  source scripts/dev-env.sh
  eval "$(scripts/dev-env.sh --print)"
  scripts/dev-env.sh -- <command> [args...]
USAGE
}

if [[ "$is_sourced" == false ]]; then
  if [[ "${1-}" == "--print" ]]; then
    if [[ "$env_file_exists" == true ]]; then
      load_env "print"
    fi
    exit 0
  fi

  if [[ "${1-}" == "--" ]]; then
    shift
  fi

  if [[ $# -gt 0 ]]; then
    if [[ "$env_file_exists" == true ]]; then
      load_env "export"
    fi
    exec "$@"
  fi

  usage >&2
  exit 2
fi

if [[ "$env_file_exists" == true ]]; then
  load_env "export"
fi

if [[ "$is_sourced" == true && -n "${BASH_VERSION-}" ]]; then
  eval "$saved_shell_opts"
fi
