function hostAccess(hostname: string): chrome.permissions.Permissions {
  return { origins: [`https://${hostname}/*`] };
}

export function requestRssHostAccess(hostname: string): Promise<boolean> {
  return chrome.permissions.request(hostAccess(hostname));
}

export function hasRssHostAccess(hostname: string): Promise<boolean> {
  return chrome.permissions.contains(hostAccess(hostname));
}
