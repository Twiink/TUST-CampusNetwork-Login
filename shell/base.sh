#!/bin/bash

ipv4=$(ifconfig en0 | grep -Eo 'inet (addr:)?([0-9]*\.){3}[0-9]*' | grep -v '127.0.0.1' | awk '{print $2}')

ipv6=$(ifconfig en0 | grep 2001 | grep -Eo 'inet6 (addr:)?([0-9a-z:]+)' | awk '{print $2}')

echo "IPv4: $ipv4"
echo "IPv6: $ipv6"

urlencode() {
    LC_ALL=C awk -- '
    BEGIN {
        for (i = 1; i <= 255; i++) hex[sprintf("%c", i)] = sprintf("%%%02X", i)
    }
    function urlencode(s,   c,i,r,l) {
        l = length(s)
        for (i = 1; i <= l; i++) {
            c = substr(s, i, 1)
            r = r "" (c ~ /^[-.~0-9a-zA-Z]$/ ? c : hex[c])
        }
        return r
    }
    BEGIN {
        for (i = 1; i < ARGC; i++)
            print urlencode(ARGV[i])
    }' "$@"
}

ipv6_encoded=$(urlencode $ipv6)

curl --noproxy '*' "http://10.10.102.50:801/eportal/portal/login?callback=dr1009&login_method=1&user_account=<user_account>&user_password=<user_password>&wlan_user_ip=$ipv4&wlan_user_ipv6=$ipv6_encoded&wlan_user_mac=000000000000&wlan_ac_ip=10.10.102.49&wlan_ac_name=&jsVersion=4.1.3&terminal_type=3&lang=zh-cn&v=1474&lang=zh"
