const sharp = require('sharp');
const got = require('got');

class ImageUtils {
    /**
     * 处理图片
     * @param {Buffer|string} input - 图片Buffer或URL
     * @param {Object} options - 处理选项
     * @param {number} options.targetWidth - 目标宽度
     * @param {number} options.targetHeight - 目标高度
     * @param {number} options.quality - JPEG质量(1-100)
     * @returns {Promise<Buffer>} 处理后的图片Buffer
     */
    static async processImage(input, options = {}) {
        try {
            const {
                targetWidth = 1200,      // 必须满足的目标宽度
                targetHeight = 675,      // 期望高度（最终可能被裁剪）
                quality = 90,
                allowUpscaling = true    // 允许放大图片（默认true）
            } = options;
    
            // 获取输入图片（支持Buffer或URL）
            let imageBuffer = input;
            if (typeof input === 'string' && input.startsWith('http')) {
                console.log(`从URL获取图片: ${input}`);
                const response = await got(input, { responseType: 'buffer' });
                imageBuffer = response.body;
                console.log(`从URL获取图片完成`);
            }
    
            // 获取原始图片元数据
            const { width: originalWidth, height: originalHeight } = 
                await sharp(imageBuffer).metadata();
    
            // 核心逻辑：计算最终缩放尺寸
            let resizeWidth, resizeHeight;
    
            if (originalWidth >= targetWidth || allowUpscaling) {
                // 情况1：原始宽度足够 或 允许放大 → 宽度优先，高度按比例缩放
                resizeWidth = targetWidth;
                resizeHeight = Math.round(targetWidth * (originalHeight / originalWidth));
            } else {
                // 情况2：不允许放大且原始宽度不足 → 使用原始尺寸（避免模糊）
                resizeWidth = originalWidth;
                resizeHeight = originalHeight;
            }
    
            // 处理图片：缩放后居中裁剪到目标尺寸
            const processedImage = await sharp(imageBuffer)
                .resize(resizeWidth, resizeHeight, {
                    fit: 'cover',       // 关键点：覆盖目标区域
                    position: 'center', // 从中心裁剪
                    withoutEnlargement: !allowUpscaling // 是否禁止放大
                })
                .extract({             // 确保输出严格符合目标尺寸
                    left: Math.max(0, Math.floor((resizeWidth - targetWidth) / 2)),
                    top: Math.max(0, Math.floor((resizeHeight - targetHeight) / 2)),
                    width: Math.min(resizeWidth, targetWidth),
                    height: Math.min(resizeHeight, targetHeight)
                })
                .jpeg({ quality })
                .toBuffer();
            console.log(`图片处理完成: 原始尺寸 ${originalWidth}x${originalHeight} → 最终尺寸 ${resizeWidth}x${resizeHeight}`);
            return processedImage;
        } catch (error) {
            throw new Error(`图片处理失败: ${error.message}`);
        }
    }

    /**
     * 获取图片信息
     * @param {Buffer|string} input - 图片Buffer或URL
     * @returns {Promise<Object>} 图片信息
     */
    static async getImageInfo(input) {
        try {
            let imageBuffer = input;
            if (typeof input === 'string' && input.startsWith('http')) {
                const response = await got(input, { responseType: 'buffer' });
                imageBuffer = response.body;
            }

            const metadata = await sharp(imageBuffer).metadata();
            return {
                width: metadata.width,
                height: metadata.height,
                format: metadata.format,
                size: metadata.size
            };
        } catch (error) {
            throw new Error(`获取图片信息失败: ${error.message}`);
        }
    }

    /**
     * 压缩图片
     * @param {Buffer|string} input - 图片Buffer或URL
     * @param {number} quality - JPEG质量(1-100)
     * @returns {Promise<Buffer>} 压缩后的图片Buffer
     */
    static async compressImage(input, quality = 80) {
        try {
            let imageBuffer = input;
            if (typeof input === 'string' && input.startsWith('http')) {
                const response = await got(input, { responseType: 'buffer' });
                imageBuffer = response.body;
            }

            const processedImage = await sharp(imageBuffer)
                .jpeg({ quality })
                .toBuffer();

            return processedImage;
        } catch (error) {
            throw new Error(`图片压缩失败: ${error.message}`);
        }
    }

    /**
     * 调整图片大小并保持宽高比
     * @param {Buffer|string} input - 图片Buffer或URL
     * @param {number} maxWidth - 最大宽度
     * @param {number} maxHeight - 最大高度
     * @returns {Promise<Buffer>} 处理后的图片Buffer
     */
    static async resizeImage(input, maxWidth = 1200, maxHeight = 1200) {
        try {
            let imageBuffer = input;
            if (typeof input === 'string' && input.startsWith('http')) {
                const response = await got(input, { responseType: 'buffer' });
                imageBuffer = response.body;
            }

            const processedImage = await sharp(imageBuffer)
                .resize(maxWidth, maxHeight, {
                    fit: 'inside',
                    withoutEnlargement: true
                })
                .toBuffer();

            return processedImage;
        } catch (error) {
            throw new Error(`图片调整大小失败: ${error.message}`);
        }
    }
}

module.exports = ImageUtils;