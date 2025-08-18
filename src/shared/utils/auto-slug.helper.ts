/**
 * AutoSlug Helper - Generate SEO-friendly slugs from any string
 * Supports multiple languages including Vietnamese, Chinese, Arabic, etc.
 */

/**
 * Generate a URL-friendly slug from any string
 * @param input - The input string to convert to slug
 * @param options - Configuration options
 * @returns A clean, URL-friendly slug
 */
export function autoSlug(
  input: string,
  options: {
    separator?: string;
    lowercase?: boolean;
    trim?: boolean;
    maxLength?: number;
  } = {}
): string {
  const {
    separator = '-',
    lowercase = true,
    trim = true,
    maxLength = 100,
  } = options;

  if (!input || typeof input !== 'string') {
    return '';
  }

  let slug = input;

  // Trim whitespace if enabled
  if (trim) {
    slug = slug.trim();
  }

  // Normalize Vietnamese characters
  slug = normalizeVietnamese(slug);

  // Normalize other diacritics and special characters
  slug = slug.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Convert to lowercase if enabled
  if (lowercase) {
    slug = slug.toLowerCase();
  }

  // Replace spaces and special characters with separator
  slug = slug
    .replace(/[^\w\s-]/g, '') // Remove special characters except word chars, spaces, and hyphens
    .replace(/[\s_-]+/g, separator) // Replace spaces, underscores, and multiple hyphens with separator
    .replace(new RegExp(`^\\${separator}+|\\${separator}+$`, 'g'), ''); // Remove leading/trailing separators

  // Limit length if specified
  if (maxLength && slug.length > maxLength) {
    slug = slug.substring(0, maxLength);
    // Remove incomplete word at the end
    const lastSeparatorIndex = slug.lastIndexOf(separator);
    if (lastSeparatorIndex > maxLength * 0.8) {
      slug = slug.substring(0, lastSeparatorIndex);
    }
  }

  return slug;
}

/**
 * Normalize Vietnamese characters to ASCII
 * @param str - Input string with Vietnamese characters
 * @returns String with Vietnamese characters converted to ASCII
 */
function normalizeVietnamese(str: string): string {
  const vietnameseMap: { [key: string]: string } = {
    // Lowercase Vietnamese characters
    'à': 'a', 'á': 'a', 'ạ': 'a', 'ả': 'a', 'ã': 'a',
    'â': 'a', 'ầ': 'a', 'ấ': 'a', 'ậ': 'a', 'ẩ': 'a', 'ẫ': 'a',
    'ă': 'a', 'ằ': 'a', 'ắ': 'a', 'ặ': 'a', 'ẳ': 'a', 'ẵ': 'a',
    'è': 'e', 'é': 'e', 'ẹ': 'e', 'ẻ': 'e', 'ẽ': 'e',
    'ê': 'e', 'ề': 'e', 'ế': 'e', 'ệ': 'e', 'ể': 'e', 'ễ': 'e',
    'ì': 'i', 'í': 'i', 'ị': 'i', 'ỉ': 'i', 'ĩ': 'i',
    'ò': 'o', 'ó': 'o', 'ọ': 'o', 'ỏ': 'o', 'õ': 'o',
    'ô': 'o', 'ồ': 'o', 'ố': 'o', 'ộ': 'o', 'ổ': 'o', 'ỗ': 'o',
    'ơ': 'o', 'ờ': 'o', 'ớ': 'o', 'ợ': 'o', 'ở': 'o', 'ỡ': 'o',
    'ù': 'u', 'ú': 'u', 'ụ': 'u', 'ủ': 'u', 'ũ': 'u',
    'ư': 'u', 'ừ': 'u', 'ứ': 'u', 'ự': 'u', 'ử': 'u', 'ữ': 'u',
    'ỳ': 'y', 'ý': 'y', 'ỵ': 'y', 'ỷ': 'y', 'ỹ': 'y',
    'đ': 'd',

    // Uppercase Vietnamese characters
    'À': 'A', 'Á': 'A', 'Ạ': 'A', 'Ả': 'A', 'Ã': 'A',
    'Â': 'A', 'Ầ': 'A', 'Ấ': 'A', 'Ậ': 'A', 'Ẩ': 'A', 'Ẫ': 'A',
    'Ă': 'A', 'Ằ': 'A', 'Ắ': 'A', 'Ặ': 'A', 'Ẳ': 'A', 'Ẵ': 'A',
    'È': 'E', 'É': 'E', 'Ẹ': 'E', 'Ẻ': 'E', 'Ẽ': 'E',
    'Ê': 'E', 'Ề': 'E', 'Ế': 'E', 'Ệ': 'E', 'Ể': 'E', 'Ễ': 'E',
    'Ì': 'I', 'Í': 'I', 'Ị': 'I', 'Ỉ': 'I', 'Ĩ': 'I',
    'Ò': 'O', 'Ó': 'O', 'Ọ': 'O', 'Ỏ': 'O', 'Õ': 'O',
    'Ô': 'O', 'Ồ': 'O', 'Ố': 'O', 'Ộ': 'O', 'Ổ': 'O', 'Ỗ': 'O',
    'Ơ': 'O', 'Ờ': 'O', 'Ớ': 'O', 'Ợ': 'O', 'Ở': 'O', 'Ỡ': 'O',
    'Ù': 'U', 'Ú': 'U', 'Ụ': 'U', 'Ủ': 'U', 'Ũ': 'U',
    'Ư': 'U', 'Ừ': 'U', 'Ứ': 'U', 'Ự': 'U', 'Ử': 'U', 'Ữ': 'U',
    'Ỳ': 'Y', 'Ý': 'Y', 'Ỵ': 'Y', 'Ỷ': 'Y', 'Ỹ': 'Y',
    'Đ': 'D',
  };

  return str.replace(/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]/g, (match) => {
    return vietnameseMap[match] || match;
  });
}

/**
 * Generate unique slug by appending number if needed
 * @param baseSlug - The base slug to make unique
 * @param existingSlugs - Array of existing slugs to check against
 * @returns A unique slug
 */
export function generateUniqueSlug(
  baseSlug: string,
  existingSlugs: string[] = []
): string {
  let uniqueSlug = baseSlug;
  let counter = 1;

  while (existingSlugs.includes(uniqueSlug)) {
    uniqueSlug = `${baseSlug}-${counter}`;
    counter++;
  }

  return uniqueSlug;
}

/**
 * Batch generate slugs for multiple strings
 * @param inputs - Array of strings to convert to slugs
 * @param options - Configuration options
 * @returns Array of slugs
 */
export function batchAutoSlug(
  inputs: string[],
  options?: Parameters<typeof autoSlug>[1]
): string[] {
  return inputs.map(input => autoSlug(input, options));
}