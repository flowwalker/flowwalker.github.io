#import <CoreGraphics/CoreGraphics.h>
#import <Foundation/Foundation.h>
#import <ImageIO/ImageIO.h>

static void fail(NSString *message) {
    fprintf(stderr, "%s\n", message.UTF8String);
    exit(1);
}

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        if (argc < 4 || argc > 6) {
            fail(@"Usage: resize_animated_gif INPUT OUTPUT MAX_PIXELS [FRAME_STEP] [DELAY_MS]");
        }

        NSString *inputPath = [NSString stringWithUTF8String:argv[1]];
        NSString *outputPath = [NSString stringWithUTF8String:argv[2]];
        NSInteger maxPixels = [[NSString stringWithUTF8String:argv[3]] integerValue];
        NSInteger frameStep = argc >= 5 ? [[NSString stringWithUTF8String:argv[4]] integerValue] : 1;
        double forcedDelay = argc >= 6 ? [[NSString stringWithUTF8String:argv[5]] doubleValue] / 1000.0 : 0;
        if (maxPixels <= 0) fail(@"MAX_PIXELS must be a positive integer");
        if (frameStep <= 0) fail(@"FRAME_STEP must be a positive integer");

        NSURL *inputURL = [NSURL fileURLWithPath:inputPath];
        NSURL *outputURL = [NSURL fileURLWithPath:outputPath];
        CGImageSourceRef source = CGImageSourceCreateWithURL((__bridge CFURLRef)inputURL, NULL);
        if (!source) fail([NSString stringWithFormat:@"Could not read %@", inputPath]);

        size_t frameCount = CGImageSourceGetCount(source);
        CGImageRef firstFrame = frameCount ? CGImageSourceCreateImageAtIndex(source, 0, NULL) : NULL;
        if (!firstFrame) fail([NSString stringWithFormat:@"No frames found in %@", inputPath]);

        CGFloat scale = MIN(1.0, (CGFloat)maxPixels / MAX(CGImageGetWidth(firstFrame), CGImageGetHeight(firstFrame)));
        size_t width = MAX(1, lround(CGImageGetWidth(firstFrame) * scale));
        size_t height = MAX(1, lround(CGImageGetHeight(firstFrame) * scale));
        CGImageRelease(firstFrame);

        size_t outputFrameCount = (frameCount + frameStep - 1) / frameStep;
        CGImageDestinationRef destination = CGImageDestinationCreateWithURL(
            (__bridge CFURLRef)outputURL,
            CFSTR("com.compuserve.gif"),
            outputFrameCount,
            NULL
        );
        if (!destination) fail([NSString stringWithFormat:@"Could not create %@", outputPath]);

        NSDictionary *globalProperties = @{
            (__bridge NSString *)kCGImagePropertyGIFDictionary: @{
                (__bridge NSString *)kCGImagePropertyGIFLoopCount: @0
            }
        };
        CGImageDestinationSetProperties(destination, (__bridge CFDictionaryRef)globalProperties);

        CGColorSpaceRef colorSpace = CGColorSpaceCreateDeviceRGB();
        for (size_t index = 0; index < frameCount; index += frameStep) {
            CGImageRef frame = CGImageSourceCreateImageAtIndex(source, index, NULL);
            if (!frame) fail([NSString stringWithFormat:@"Could not decode frame %zu", index]);

            CGContextRef context = CGBitmapContextCreate(
                NULL,
                width,
                height,
                8,
                0,
                colorSpace,
                (CGBitmapInfo)kCGImageAlphaPremultipliedLast
            );
            if (!context) fail([NSString stringWithFormat:@"Could not resize frame %zu", index]);
            CGContextSetInterpolationQuality(context, kCGInterpolationHigh);
            CGContextDrawImage(context, CGRectMake(0, 0, width, height), frame);
            CGImageRef resized = CGBitmapContextCreateImage(context);

            NSDictionary *sourceProperties = CFBridgingRelease(
                CGImageSourceCopyPropertiesAtIndex(source, index, NULL)
            );
            NSDictionary *sourceGIF = sourceProperties[(__bridge NSString *)kCGImagePropertyGIFDictionary];
            NSNumber *delayValue = sourceGIF[(__bridge NSString *)kCGImagePropertyGIFUnclampedDelayTime]
                ?: sourceGIF[(__bridge NSString *)kCGImagePropertyGIFDelayTime]
                ?: @0.1;
            NSNumber *delay = @(MAX(0.02, forcedDelay > 0 ? forcedDelay : delayValue.doubleValue));
            NSDictionary *frameProperties = @{
                (__bridge NSString *)kCGImagePropertyGIFDictionary: @{
                    (__bridge NSString *)kCGImagePropertyGIFDelayTime: delay,
                    (__bridge NSString *)kCGImagePropertyGIFUnclampedDelayTime: delay
                }
            };
            CGImageDestinationAddImage(destination, resized, (__bridge CFDictionaryRef)frameProperties);

            CGImageRelease(resized);
            CGContextRelease(context);
            CGImageRelease(frame);
        }

        CGColorSpaceRelease(colorSpace);
        CFRelease(source);
        if (!CGImageDestinationFinalize(destination)) fail([NSString stringWithFormat:@"Could not finish %@", outputPath]);
        CFRelease(destination);
    }
    return 0;
}
