// Use only the SDK supplied by the Copilot host; never install a second SDK.
export async function joinSpySession(tools, importModule = specifier => import(specifier)) {
  const choices = [
    { specifier: '@microsoft/copilot-sdk/extension', config: { tools: { definitions: tools } } },
    { specifier: '@github/copilot-sdk/extension', config: { tools } },
  ];
  for (const { specifier, config } of choices) {
    let sdk;
    try { sdk = await importModule(specifier); }
    catch (error) {
      const missing = ['ERR_MODULE_NOT_FOUND', 'ERR_PACKAGE_PATH_NOT_EXPORTED'].includes(error.code) && error.message?.includes(specifier.split('/').slice(0, 2).join('/'));
      if (missing) continue;
      throw error; // Preserve real dependency/initialization failures.
    }
    if (typeof sdk.joinSession !== 'function') throw Error(`Copilot host SDK ${specifier} does not expose joinSession`);
    return sdk.joinSession(config);
  }
  throw Error('Copilot did not provide its extension SDK. Load Spy through /extensions manage in a Copilot CLI session, rather than running extension.mjs directly.');
}
