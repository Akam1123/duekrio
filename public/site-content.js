document.querySelectorAll('[data-copy]').forEach(button => {
  button.addEventListener('click', async () => {
    const text = document.getElementById(button.dataset.copy)?.textContent || ''
    const status = button.nextElementSibling
    try {
      await navigator.clipboard.writeText(text)
      status.textContent = 'Copied. Review every detail before sending.'
    } catch {
      status.textContent = 'Copy was blocked by your browser. Select the text above instead.'
    }
  })
})
