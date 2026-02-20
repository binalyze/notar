<script setup lang="ts">
import { ref, computed, watch } from "vue";
import Button from "@/components/ui/Button.vue";
import DropZone from "@/components/ui/DropZone.vue";
import SampleDropdown from "@/components/ui/SampleDropdown.vue";
import { Eye, EyeOff, Copy, Check, ChevronRight, Folder, FileText } from "lucide-vue-next";
import { useCopy } from "@/composables/useCopy";
import { unzipSync } from "fflate";
import {
  sign as notarSign,
  base64ToUint8,
  uint8ToBase64,
  derivePublicKey,
  parseFrontMatter,
  stringifyFrontMatter,
} from "@binalyze/notar";

const props = defineProps<{
  initialPrivateKey?: string;
  initialPublicKey?: string;
  initialPublisher?: string;
  initialKeyId?: string;
}>();

const file = ref<File | null>(null);
const dropZoneRef = ref<InstanceType<typeof DropZone>>();
const sampleRef = ref<InstanceType<typeof SampleDropdown>>();
const loading = ref(false);
const signed = ref(false);
const error = ref("");
const zipContents = ref<{ path: string; size: number }[]>([]);

const step1Done = computed(() => !!publisher.value && !!privateKey.value && !!publicKey.value);
const step2Done = computed(() => !!file.value);
const step3Ready = computed(() => step1Done.value && step2Done.value);
const step3Done = computed(() => step3Ready.value && !!name.value && !!description.value && !!version.value);
const step4Ready = computed(() => step3Done.value);

// Document properties
const name = ref("");
const description = ref("Description goes here");
const version = ref("1.0.0");
const author = ref(window.location.host);

// Signing properties
const publisher = ref(props.initialPublisher || window.location.host);
const keyId = ref(props.initialKeyId || "");
const privateKey = ref(props.initialPrivateKey ?? "");
const publicKey = ref(props.initialPublicKey ?? "");
const showPrivateKey = ref(!props.initialPrivateKey);
const { copied: privateKeyCopied, copy: copyPrivateKey } = useCopy();

async function updatePublicKeyFromPrivate(privKeyB64: string) {
  if (!privKeyB64) { publicKey.value = ""; return; }
  try {
    const pk = base64ToUint8(privKeyB64);
    const pub = await derivePublicKey(pk);
    publicKey.value = uint8ToBase64(pub);
  } catch {
    publicKey.value = "";
  }
}

watch(() => props.initialPrivateKey, (val) => {
  if (val) {
    privateKey.value = val;
    showPrivateKey.value = false;
  }
});
watch(() => props.initialPublicKey, (val) => {
  if (val) publicKey.value = val;
});
watch(() => props.initialKeyId, (val) => {
  if (val) keyId.value = val;
});
watch(() => props.initialPublisher, (val) => {
  if (val) publisher.value = val;
});

watch(privateKey, (val) => updatePublicKeyFromPrivate(val));

function fileNameToSnakeCase(filename: string): string {
  return filename
    .replace(/\.[^.]+$/, "")
    .replaceAll(/([a-z])([A-Z])/g, "$1_$2")
    .replaceAll(/[\s\-.]+/g, "_")
    .replaceAll(/_+/g, "_")
    .toLowerCase();
}

// Parsed markdown state (preserved to reconstruct before signing)
const mdBody = ref("");
const mdExtraFields = ref<Record<string, unknown>>({});
const mdSignatures = ref<{ keyId: string; publisher: string; value: string }[]>([]);

const isZip = computed(
  () => file.value?.name.endsWith(".zip") || file.value?.type === "application/zip",
);
const isMd = computed(
  () =>
    file.value?.name.endsWith(".md") ||
    file.value?.type === "text/markdown" ||
    file.value?.type === "text/x-markdown",
);
const showMetadataForm = computed(() => file.value && (isZip.value || isMd.value));

function resetMetadata() {
  name.value = "";
  description.value = "Description goes here";
  version.value = "1.0.0";
  author.value = window.location.host;
  mdBody.value = "";
  mdExtraFields.value = {};
  mdSignatures.value = [];
}

function signedFileName(name: string): string {
  const dot = name.lastIndexOf(".")
  if (dot === -1) return `${name}-signed`
  return `${name.slice(0, dot)}-signed${name.slice(dot)}`
}

function onSampleSelect(f: File) {
  dropZoneRef.value?.setFile(f);
  onFileSelect(f);
}

function onFileClear() {
  file.value = null;
  error.value = "";
  signed.value = false;
  zipContents.value = [];
  resetMetadata();
  sampleRef.value?.reset();
}

function onFileSelect(f: File) {
  file.value = f;
  error.value = "";
  signed.value = false;
  resetMetadata();

  const snakeName = fileNameToSnakeCase(f.name);

  if (f.name.endsWith(".zip") || f.type === "application/zip") {
    name.value = snakeName;
    f.arrayBuffer().then((buf) => {
      try {
        const entries = unzipSync(new Uint8Array(buf));
        zipContents.value = Object.entries(entries).map(([path, data]) => ({
          path,
          size: data.length,
        }));
      } catch {
        zipContents.value = [];
      }
    });
  } else {
    zipContents.value = [];
    f.text().then((text) => {
      const parsed = parseFrontMatter(text);
      const d = parsed.data;
      name.value = String(d.name ?? "") || snakeName;
      description.value = String(d.description ?? "") || "Description goes here";
      version.value = String(d.version ?? "") || "1.0.0";
      author.value = String(d.author ?? "") || window.location.host;
      const sigs = d.signatures as { keyId: string; publisher: string; value: string }[] | undefined;
      if (sigs?.[0]?.publisher) publisher.value = sigs[0].publisher;
      if (sigs?.[0]?.keyId) keyId.value = sigs[0].keyId;
      mdSignatures.value = sigs ?? [];
      mdBody.value = parsed.content;
      const known = new Set(["name", "description", "version", "author", "keyId", "signatures", "signature"]);
      const extra: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(d)) {
        if (!known.has(k)) extra[k] = v;
      }
      mdExtraFields.value = extra;
    });
  }
}

// Tree view for archive contents
interface ArchiveTreeNode {
  name: string
  isDir: boolean
  size: number
  depth: number
  path: string
  hasChildren: boolean
}
type NodeMap = Map<string, { children: NodeMap; size: number; isDir: boolean }>

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

function ensureNode(map: NodeMap, name: string) {
  if (!map.has(name)) map.set(name, { children: new Map(), size: 0, isDir: false })
  return map.get(name)!
}

function buildNodeMap(entries: { path: string; size: number }[]): NodeMap {
  const root: NodeMap = new Map()
  for (const entry of entries) {
    const parts = entry.path.split("/").filter(Boolean)
    if (!parts.length) continue
    let current = root
    for (let i = 0; i < parts.length; i++) {
      const node = ensureNode(current, parts[i])
      const isLast = i === parts.length - 1
      if (isLast) { node.size = entry.size; node.isDir = node.isDir || entry.path.endsWith("/") }
      else node.isDir = true
      current = node.children
    }
  }
  return root
}

function flattenTree(map: NodeMap, expanded: Set<string>, depth = 0, parentPath = ""): ArchiveTreeNode[] {
  const result: ArchiveTreeNode[] = []
  const sorted = [...map.entries()].sort(([a, an], [b, bn]) => {
    const aDir = an.isDir || an.children.size > 0
    const bDir = bn.isDir || bn.children.size > 0
    if (aDir !== bDir) return aDir ? -1 : 1
    return a.localeCompare(b)
  })
  for (const [name, node] of sorted) {
    const path = parentPath ? `${parentPath}/${name}` : name
    const hasChildren = node.children.size > 0
    result.push({ name, depth, isDir: node.isDir || hasChildren, size: node.size, path, hasChildren })
    if (hasChildren && expanded.has(path)) {
      result.push(...flattenTree(node.children, expanded, depth + 1, path))
    }
  }
  return result
}

const expandedDirs = ref(new Set<string>())
const archiveTree = computed((): ArchiveTreeNode[] => {
  if (!zipContents.value.length) return []
  return flattenTree(buildNodeMap(zipContents.value), expandedDirs.value)
})

function toggleDir(path: string) {
  if (expandedDirs.value.has(path)) {
    expandedDirs.value.delete(path)
  } else {
    expandedDirs.value.add(path)
  }
}

watch(zipContents, (entries) => {
  if (!entries.length) {
    expandedDirs.value = new Set()
    return
  }
  const dirs = new Set<string>()
  for (const entry of entries) {
    const parts = entry.path.split("/").filter(Boolean)
    for (let i = 0; i < parts.length - 1; i++) {
      dirs.add(parts.slice(0, i + 1).join("/"))
    }
    if (entry.path.endsWith("/")) dirs.add(parts.join("/"))
  }
  expandedDirs.value = dirs
})

function download(data: string | Uint8Array, filename: string, type: string) {
  const blob = new Blob([data instanceof Uint8Array ? data.slice() : data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function sign() {
  if (!file.value || !privateKey.value) return;
  if (!name.value || !description.value || !version.value || !publisher.value) {
    error.value = "Name, description, version, and publisher are required";
    return;
  }
  loading.value = true;
  error.value = "";

  try {
    let pk: Uint8Array;
    try {
      pk = base64ToUint8(privateKey.value);
    } catch {
      error.value = "Invalid private key format";
      return;
    }

    if (isZip.value) {
      const bytes = new Uint8Array(await file.value.arrayBuffer());
      const signedZip = await notarSign(bytes, pk, {
        name: name.value,
        description: description.value,
        version: version.value,
        author: author.value || publisher.value,
        ...(keyId.value && { keyId: keyId.value }),
        publisher: publisher.value,
      });
      download(signedZip, signedFileName(file.value.name), "application/zip");
      signed.value = true;
    } else {
      const frontMatterData: Record<string, unknown> = {
        name: name.value,
        description: description.value,
        version: version.value,
        author: author.value || publisher.value,
        ...mdExtraFields.value,
        ...(mdSignatures.value.length > 0 && { signatures: mdSignatures.value }),
      };
      const content = stringifyFrontMatter(mdBody.value, frontMatterData);
      const signedMd = await notarSign(content, pk, {
        ...(keyId.value && { keyId: keyId.value }),
        publisher: publisher.value,
      });
      download(signedMd, signedFileName(file.value.name), "text/markdown");
      signed.value = true;
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Signing failed";
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- Step 1: Signing Identity -->
    <div class="space-y-3">
      <div class="flex items-center gap-3">
        <div
          :class="[
            'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
            step1Done
              ? 'bg-success text-success-foreground'
              : 'bg-primary text-primary-foreground',
          ]"
        >1</div>
        <h3 class="font-semibold text-foreground">Signing Identity</h3>
      </div>
      <p class="text-sm text-muted-foreground ml-10">
        Provide your publisher domain, key ID, and private key.
      </p>
      <div class="ml-10 space-y-4">
        <div class="grid grid-cols-2 gap-4">
          <div class="space-y-1.5">
            <label class="text-sm font-medium text-foreground">Publisher *</label>
            <input
              v-model="publisher"
              type="text"
              placeholder="yourdomain.com"
              autocomplete="off"
              data-lpignore="true"
              data-1p-ignore
              data-form-type="other"
              class="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p class="text-xs text-muted-foreground">Domain where your public key is published</p>
          </div>
          <div class="space-y-1.5">
            <label class="text-sm font-medium text-foreground">Key ID</label>
            <input
              v-model="keyId"
              type="text"
              placeholder="key_abc123..."
              autocomplete="off"
              data-lpignore="true"
              data-1p-ignore
              data-form-type="other"
              class="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
        <div class="space-y-1.5">
          <label class="text-sm font-medium text-foreground">Private Key (Base64)</label>
          <div class="relative">
            <input
              v-model="privateKey"
              type="text"
              placeholder="Paste your Ed25519 private key..."
              autocomplete="off"
              data-lpignore="true"
              data-1p-ignore
              data-form-type="other"
              :class="['w-full px-3 py-2 pr-20 bg-background border border-input rounded-lg text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring', !showPrivateKey && 'mask-password']"
            />
            <div v-if="privateKey" class="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              <button
                class="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                :title="showPrivateKey ? 'Hide' : 'Reveal'"
                @click="showPrivateKey = !showPrivateKey"
              >
                <EyeOff v-if="showPrivateKey" class="w-4 h-4" />
                <Eye v-else class="w-4 h-4" />
              </button>
              <button
                class="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                title="Copy"
                @click="copyPrivateKey(privateKey)"
              >
                <Check v-if="privateKeyCopied" class="w-4 h-4 text-success" />
                <Copy v-else class="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Step 2: Select File -->
    <div class="space-y-3">
      <div class="flex items-center gap-3">
        <div
          :class="[
            'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors',
            step2Done
              ? 'bg-success text-success-foreground'
              : 'bg-primary text-primary-foreground',
          ]"
        >2</div>
        <h3 class="font-semibold text-foreground">Select File</h3>
      </div>
      <p class="text-sm text-muted-foreground ml-10">
        Drop or select a markdown or ZIP file to sign.
      </p>
      <div class="ml-10">
        <DropZone ref="dropZoneRef" @select="onFileSelect" @clear="onFileClear" />
        <SampleDropdown ref="sampleRef" @select="onSampleSelect" />
      </div>
      <!-- ZIP contents (tree view) -->
      <div v-if="archiveTree.length > 0" class="ml-10 space-y-2">
        <label class="text-sm font-medium text-foreground">Archive Contents</label>
        <div class="bg-muted rounded-lg p-3 max-h-64 overflow-y-auto">
          <div
            v-for="node in archiveTree"
            :key="node.path"
            class="flex items-center justify-between py-0.5 text-sm"
            :style="{ paddingLeft: `${node.depth * 20}px` }"
          >
            <div class="flex items-center gap-1.5 min-w-0">
              <button
                v-if="node.hasChildren"
                class="text-muted-foreground hover:text-foreground transition-colors shrink-0 p-0.5 rounded"
                @click="toggleDir(node.path)"
              >
                <ChevronRight
                  :class="['w-3.5 h-3.5 transition-transform duration-150', expandedDirs.has(node.path) && 'rotate-90']"
                />
              </button>
              <span v-else class="w-[18px] shrink-0" />
              <Folder v-if="node.isDir" class="w-4 h-4 text-muted-foreground shrink-0" />
              <FileText v-else class="w-4 h-4 text-muted-foreground shrink-0" />
              <span class="text-foreground font-mono text-xs truncate">{{ node.name }}</span>
            </div>
            <span v-if="!node.isDir" class="text-muted-foreground text-xs shrink-0 ml-3">
              {{ formatSize(node.size) }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Step 3: Document Properties -->
    <div :class="['space-y-3 transition-opacity', !step3Ready && 'opacity-50']">
      <div class="flex items-center gap-3">
        <div
          :class="[
            'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors',
            step3Done
              ? 'bg-success text-success-foreground'
              : 'bg-primary text-primary-foreground',
          ]"
        >3</div>
        <h3 class="font-semibold text-foreground">Document Properties</h3>
      </div>
      <p class="text-sm text-muted-foreground ml-10">
        Review and edit the metadata that will be embedded in the signed file.
      </p>
      <div v-if="step3Ready && showMetadataForm" class="ml-10">
        <div class="grid grid-cols-2 gap-4">
          <div class="space-y-1.5">
            <label class="text-sm font-medium text-foreground">Name *</label>
            <input
              v-model="name"
              type="text"
              placeholder="my-skill"
              class="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div class="space-y-1.5">
            <label class="text-sm font-medium text-foreground">Version *</label>
            <input
              v-model="version"
              type="text"
              placeholder="1.0.0"
              class="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div class="col-span-2 space-y-1.5">
            <label class="text-sm font-medium text-foreground">Description *</label>
            <input
              v-model="description"
              type="text"
              placeholder="Brief description of the skill or package"
              class="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div class="col-span-2 space-y-1.5">
            <label class="text-sm font-medium text-foreground">Author</label>
            <input
              v-model="author"
              type="text"
              placeholder="Jane Doe, Acme Corp, etc."
              class="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Step 4: Sign -->
    <div :class="['space-y-3 transition-opacity', !step4Ready && 'opacity-50']">
      <div class="flex items-center gap-3">
        <div
          :class="[
            'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors',
            signed
              ? 'bg-success text-success-foreground'
              : 'bg-primary text-primary-foreground',
          ]"
        >4</div>
        <h3 class="font-semibold text-foreground">Sign & Download</h3>
      </div>
      <p class="text-sm text-muted-foreground ml-10">
        Sign the file. The signed file will be downloaded automatically.
      </p>
      <div v-if="step4Ready" class="ml-10 space-y-4">
        <div v-if="error" class="p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-sm text-destructive">
          {{ error }}
        </div>
        <Button
          :loading="loading"
          :disabled="!step4Ready"
          class="w-full"
          @click="sign"
        >
          Sign File
        </Button>
      </div>
    </div>
  </div>
</template>
