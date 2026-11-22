// Call directly from the click handler so opening the tab keeps user activation.
export async function openCvWindow(
  loadUrl: () => Promise<string>,
  browser: Pick<Window, "open"> = window,
): Promise<void> {
  const popup = browser.open("about:blank", "_blank");
  if (!popup) throw new Error("Allow pop-ups to view this CV, then try again.");
  popup.opener = null;
  try {
    const url = await loadUrl();
    if (!popup.closed) popup.location.replace(url);
  } catch (error) {
    popup.close();
    throw error;
  }
}
