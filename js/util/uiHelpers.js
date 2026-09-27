export function setHtmlOrText(el, val) {
    const htmlVal = String(val);
    if (el.__lastVal === htmlVal) return;
    el.__lastVal = htmlVal;

    if (htmlVal.includes('<')) {
        el.innerHTML = htmlVal;
    } else {
        el.textContent = htmlVal;
    }
}

export function stripHtml(value) {
    if (typeof value !== "string") return value;
    return value.replace(/<[^>]*>?/gm, "");
}
