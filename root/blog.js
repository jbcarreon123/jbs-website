var codeBlocks = document.getElementsByClassName('shiki');
console.log(codeBlocks)

Array.prototype.forEach.call(codeBlocks, function(codeBlock) {
  codeBlock.onclick = function() {
    var text = this.textContent || this.innerText;
    copyToClipboard(text);
  };
  codeBlock.setAttribute('title', 'Click this to copy the code to your clipboard');
});

async function copyToClipboard(textToCopy) {
    if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(textToCopy);
    } else {
        const textArea = document.createElement("textarea");
        textArea.value = textToCopy;
        textArea.style.position = "absolute";
        textArea.style.left = "-999999px";
        document.body.prepend(textArea);
        textArea.select();
        try {
            document.execCommand('copy');
        } catch (error) {
            console.error(error);
        } finally {
            textArea.remove();
        }
    }
}