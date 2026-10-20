/**
 * A stand-in for the zca-js API object that always forwards to the CURRENT instance.
 * After a re-login getApi() returns a new object; tools and the notifier that captured the
 * old one at startup would keep calling a dead session. Methods are bound to the live instance.
 */

/**
 * @param {() => object} getApi - returns the current zca-js API instance
 * @returns {object}
 */
export function createLiveApi(getApi) {
    return new Proxy(
        {},
        {
            get(_target, prop) {
                const api = getApi();
                const value = api?.[prop];
                return typeof value === "function" ? value.bind(api) : value;
            },
        },
    );
}
