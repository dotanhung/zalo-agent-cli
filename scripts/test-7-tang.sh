#!/usr/bin/env bash
# Kiểm thử 7 tầng cho zalo-agent-cli.
# Tầng 1–5 chạy tự động (không cần tài khoản Zalo). Tầng 6–7 là checklist thử tay,
# xem .claude/skills/test-7-tang/SKILL.md.
#
# Dùng: bash scripts/test-7-tang.sh            # chạy tầng 1–5
#       bash scripts/test-7-tang.sh 1 3 4      # chỉ chạy các tầng chỉ định

set -u
cd "$(dirname "$0")/.."

LAYERS=("$@")
[ ${#LAYERS[@]} -eq 0 ] && LAYERS=(1 2 3 4 5)

declare -a RESULTS=()
FAILED=0

record() { # $1=tầng $2=tên $3=PASS|FAIL $4=ghi chú
    RESULTS+=("$1|$2|$3|$4")
    if [ "$3" = "FAIL" ]; then FAILED=1; fi
    return 0
}

run() { # chạy lệnh, ẩn output khi đạt, in output khi trượt
    local out
    if out=$("$@" 2>&1); then return 0; fi
    echo "$out" | tail -30 >&2
    return 1
}

layer1() { # Tĩnh: lint + định dạng
    run npm run --silent lint && run npm run --silent format:check \
        && record 1 "Tĩnh (lint, format)" PASS "" \
        || record 1 "Tĩnh (lint, format)" FAIL "npm run lint / format:check"
}

layer2() { # Đơn vị + tích hợp giả lập (node:test, Zalo API giả)
    local out
    out=$(npm test 2>&1)
    local pass fail
    pass=$(echo "$out" | sed -n 's/^# pass //p')
    fail=$(echo "$out" | sed -n 's/^# fail //p')
    if [ "${fail:-1}" = "0" ]; then
        record 2 "Đơn vị + tích hợp" PASS "${pass} bài đạt"
    else
        echo "$out" | grep -E "^not ok|AssertionError" | head -20 >&2
        record 2 "Đơn vị + tích hợp" FAIL "${fail:-?} bài trượt"
    fi
}

layer3() { # Hợp đồng CLI: mọi nhóm lệnh khởi động và in --help
    local bad=()
    run node src/index.js --version || bad+=("--version")
    for cmd in login logout status whoami msg friend group conv account profile poll \
        reminder auto-reply quick-msg label catalog listen oa mcp; do
        run node src/index.js "$cmd" --help || bad+=("$cmd")
    done
    if [ ${#bad[@]} -eq 0 ]; then
        record 3 "Hợp đồng CLI" PASS "20 lệnh --help OK"
    else
        record 3 "Hợp đồng CLI" FAIL "lỗi: ${bad[*]}"
    fi
}

layer4() { # Bảo mật: lỗ hổng thư viện, file bí mật bị commit, khóa gửi tin MCP
    local notes=() ok=1
    if ! run npm audit --omit=dev --audit-level=high; then
        ok=0; notes+=("npm audit có lỗ hổng high/critical")
    fi
    local leaked
    leaked=$(git ls-files | grep -E '(^|/)(cred_[^/]*\.json|\.env(\..*)?|[^/]*\.pem|[^/]*\.key|mcp-send-log\.jsonl)$' || true)
    if [ -n "$leaked" ]; then
        ok=0; notes+=("file bí mật trong git: $(echo "$leaked" | tr '\n' ' ')")
    fi
    if ! run node --test src/mcp/send-guard.test.js; then
        ok=0; notes+=("khóa gửi tin MCP trượt")
    fi
    [ $ok -eq 1 ] && record 4 "Bảo mật" PASS "0 lỗ hổng high, không lộ bí mật, khóa gửi OK" \
        || record 4 "Bảo mật" FAIL "${notes[*]}"
}

layer5() { # Đóng gói: npm pack, cài từ tarball vào thư mục tạm, chạy được
    local tmp
    tmp=$(mktemp -d)
    trap 'rm -rf "$tmp"' RETURN
    local tgz
    if ! tgz=$(npm pack --silent --pack-destination "$tmp" 2>/dev/null | tail -1) || [ -z "$tgz" ]; then
        record 5 "Đóng gói" FAIL "npm pack lỗi"; return
    fi
    local listing
    listing=$(tar tzf "$tmp/$tgz")
    if echo "$listing" | grep -qE 'cred_|\.env|mcp-send-log'; then
        record 5 "Đóng gói" FAIL "gói chứa file bí mật"; return
    fi
    if ! echo "$listing" | grep -q 'package/src/mcp/send-guard.js'; then
        record 5 "Đóng gói" FAIL "gói thiếu src/mcp/send-guard.js"; return
    fi
    if ! run npm install --silent --no-audit --no-fund --prefix "$tmp/inst" "$tmp/$tgz"; then
        record 5 "Đóng gói" FAIL "cài từ tarball lỗi"; return
    fi
    local ver
    ver=$("$tmp/inst/node_modules/.bin/zalo-agent" --version 2>&1)
    if [ "$ver" = "$(node -p 'require("./package.json").version')" ]; then
        record 5 "Đóng gói" PASS "cài từ tarball, v$ver chạy được"
    else
        record 5 "Đóng gói" FAIL "bản cài chạy lỗi: $ver"
    fi
}

for n in "${LAYERS[@]}"; do
    case "$n" in
        1 | 2 | 3 | 4 | 5) echo "▶ Tầng $n..." >&2; "layer$n" ;;
        6 | 7) record "$n" "Thử tay" SKIP "xem checklist tầng $n trong SKILL.md" ;;
        *) echo "Tầng không hợp lệ: $n (1–7)" >&2; exit 2 ;;
    esac
done

echo
echo "| Tầng | Nội dung | Kết quả | Ghi chú |"
echo "|---|---|---|---|"
for r in "${RESULTS[@]}"; do
    IFS='|' read -r n name st note <<<"$r"
    echo "| $n | $name | $st | $note |"
done
echo
[ $FAILED -eq 0 ] && echo "KẾT LUẬN: ĐẠT" || echo "KẾT LUẬN: TRƯỢT"
exit $FAILED
