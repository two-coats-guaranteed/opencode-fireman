struct SessionRegistry {
    int active_count;
};

int read_static_buildinfo_count(const SessionRegistry& reg) {
    return reg.active_count;
}
