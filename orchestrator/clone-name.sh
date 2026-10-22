# Sourced by pass.sh and stop.sh, so both refuse the same names: a clone's
# name is one path segment, never `.`, `..` or an option, matched whole.
segment='^[A-Za-z0-9][A-Za-z0-9._-]*$'
