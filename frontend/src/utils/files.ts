const SUPPORTED_EXTENSIONS = ['.pdf', '.txt', '.md']

export function isSupportedFile(file: File): boolean {
  const name = (file.webkitRelativePath || file.name).toLowerCase()
  return SUPPORTED_EXTENSIONS.some((ext) => name.endsWith(ext))
}

export function filterSupportedFiles(files: Iterable<File>): File[] {
  return Array.from(files).filter(isSupportedFile)
}

async function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  const all: FileSystemEntry[] = []
  let batch: FileSystemEntry[]
  do {
    batch = await new Promise<FileSystemEntry[]>((resolve, reject) => {
      reader.readEntries(resolve, reject)
    })
    all.push(...batch)
  } while (batch.length > 0)
  return all
}

async function readEntry(entry: FileSystemEntry, path: string, files: File[]): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => {
      ;(entry as FileSystemFileEntry).file(resolve, reject)
    })
    const relativePath = path ? `${path}/${entry.name}` : entry.name
    files.push(new File([file], relativePath, { type: file.type, lastModified: file.lastModified }))
    return
  }

  if (entry.isDirectory) {
    const dirReader = (entry as FileSystemDirectoryEntry).createReader()
    const entries = await readAllEntries(dirReader)
    const dirPath = path ? `${path}/${entry.name}` : entry.name
    for (const child of entries) {
      await readEntry(child, dirPath, files)
    }
  }
}

export async function getFilesFromDataTransfer(dt: DataTransfer): Promise<File[]> {
  const items = dt.items
  if (!items?.length) return Array.from(dt.files)

  const files: File[] = []
  for (let i = 0; i < items.length; i++) {
    const entry = items[i].webkitGetAsEntry?.()
    if (entry) {
      await readEntry(entry, '', files)
    }
  }

  return files.length > 0 ? files : Array.from(dt.files)
}
