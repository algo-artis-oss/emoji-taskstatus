import fs from "fs";
import path from "path";
import util from "util";
import sharp from "sharp";
import ZipStream from "zip-stream";

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const PATH_ABS_SRC_DIR = path.join(__dirname, "src");
const PATH_ABS_DIST_DIR = path.join(__dirname, "dist");
const DIST_SIZE_LIST = [16, 24, 32, 48, 64, 128];

const promisifyStream = (stream) =>
  new Promise((resolve, reject) => {
    stream.on("finish", resolve);
    stream.on("error", reject);
  });

const createWriteStreamWithMkdir = (pRelFilePath) => {
  const pAbsFilePath = path.join(PATH_ABS_DIST_DIR, pRelFilePath);
  const pAbsDirPath = path.dirname(pAbsFilePath);
  if (!fs.existsSync(pAbsDirPath)) {
    fs.mkdirSync(pAbsDirPath, { recursive: true });
  }
  return fs.createWriteStream(pAbsFilePath);
};

const processSrcFile = async (pSrcRelPath) => {
  const pSrcAbsPath = path.join(PATH_ABS_SRC_DIR, pSrcRelPath);
  const sSrcFile = fs.createReadStream(pSrcAbsPath);

  await Promise.all(
    [
      sSrcFile.pipe(createWriteStreamWithMkdir("svg/" + pSrcRelPath)),
      ...DIST_SIZE_LIST.map((size) =>
        sSrcFile
          .pipe(sharp().resize(size, size).png())
          .pipe(
            createWriteStreamWithMkdir(
              `png_${size}/${pSrcRelPath.replace(/\.svg$/, ".png")}`
            )
          )
      ),
    ].map(promisifyStream)
  );
};

const archiveDistFiles = async () => {
  const archive = new ZipStream();
  const addEntryToArchive = util.promisify(archive.entry.bind(archive));
  const writeStream = createWriteStreamWithMkdir("emoji-taskstatus.zip");
  const writeStreamPromise = promisifyStream(writeStream);
  archive.pipe(writeStream);

  const paSrcFiles = fs.readdirSync(PATH_ABS_DIST_DIR, {
    recursive: true,
    withFileTypes: true,
  });
  for (const dirent of paSrcFiles) {
    if (dirent.name.endsWith(".zip")) continue;
    const pAbsFilePath = path.join(dirent.parentPath, dirent.name);
    const pRelFilePath = path.relative(PATH_ABS_DIST_DIR, pAbsFilePath);

    await addEntryToArchive(
      dirent.isDirectory() ? null : fs.createReadStream(pAbsFilePath),
      { name: pRelFilePath }
    );
  }
  await archive.finalize();
  await writeStreamPromise;
};

(async () => {
  for (const pSrcRelPath of fs.readdirSync(PATH_ABS_SRC_DIR)) {
    console.log(`Processing ${pSrcRelPath}...`);
    await processSrcFile(pSrcRelPath);
  }
  console.log("Archiving dist files...");
  await archiveDistFiles();
  console.log("Done.");
})();
