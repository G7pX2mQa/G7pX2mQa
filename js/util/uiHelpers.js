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
