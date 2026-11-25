export function bindFilePicker(input, onFile) {
  const zone = input.closest(".picker");
  input.onchange = () => {
    const file = input.files[0];
    input.value = "";
    if (file) onFile(file);
  };
  zone.ondragover = event => {
    event.preventDefault();
    zone.classList.add("over");
  };
  zone.ondragleave = () => zone.classList.remove("over");
  zone.ondrop = event => {
    event.preventDefault();
    zone.classList.remove("over");
    const file = event.dataTransfer.files[0];
    if (file) onFile(file);
  };
}
