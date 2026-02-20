import { ref } from "vue";

export function useCopy() {
  const copied = ref(false);

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  }

  return { copied, copy };
}
