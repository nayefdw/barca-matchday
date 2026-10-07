// Image URLs are external resources, never HTML or inline SVG markup.
export function safeCrest(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port ||
        !['crests.football-data.org', 'upload.wikimedia.org'].includes(url.hostname) ||
        !/\.(svg|png|webp|jpe?g)$/i.test(url.pathname)) return null;
    return url.href;
  } catch { return null; }
}
export function clubTeam(team) {
  return { id:team.id, name:team.name, shortName:team.shortName || team.name, tla:team.tla || 'FC', crest:safeCrest(team.crest) };
}
