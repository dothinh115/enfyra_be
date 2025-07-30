import * as fs from 'fs';
import * as path from 'path';

export function clearOldEntitiesJs() {
  const directory = path.resolve('dist', 'src', 'entities');

  if (!fs.existsSync(directory)) return;

  const files = fs.readdirSync(directory);

  for (const file of files) {
    const fullPath = path.join(directory, file);

    try {
      const stat = fs.statSync(fullPath);

      // Đảm bảo chỉ xoá file thường và có đuôi .js
      if (stat.isFile() && file.endsWith('.js')) {
        fs.unlinkSync(fullPath);
      }
    } catch (err) {
      console.error(`❌ Lỗi khi xử lý: ${fullPath}`, err);
    }
  }
}
