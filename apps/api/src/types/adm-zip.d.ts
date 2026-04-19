declare module "adm-zip" {
  export default class AdmZip {
    constructor(data?: Buffer | string);
    getEntries(): ZipEntry[];
  }
  interface ZipEntry {
    entryName: string;
    isDirectory: boolean;
    getData(): Buffer;
  }
}
