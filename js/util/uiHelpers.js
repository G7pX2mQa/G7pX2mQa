export function setHtmlOrText(el, val) {
    const htmlVal = String(val);
    if (htmlVal.includes('<')) {
        el.innerHTML = htmlVal;
    } else {
        el.textContent = htmlVal;
    }
}
