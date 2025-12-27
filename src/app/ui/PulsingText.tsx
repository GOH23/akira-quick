import { motion } from 'framer-motion';

const PulsingText = ({ children, className }: { children: string, className?: string }) => {
    return (

        <motion.h1
            className={"text-6xl font-bold p-6 relative " + className}
        >
            {/* Основной текст - всегда видим и статичен */}
            <span
                style={{
                    color: "white",
                    display: "inline-block",
                }}
            >
                {children}
            </span>

            {/* Анимированные границы - создаются и исчезают */}
            <motion.span
                className={className}
                style={{
                    color: "transparent",
                    WebkitTextStrokeWidth: "0px",
                    WebkitTextStrokeColor: "white",
                    display: "inline-block",
                    position: "absolute",
                    top: "1.5rem",
                    left: "1.5rem",
                }}
                animate={{
                    //@ts-ignore
                    WebkitTextStrokeWidth: ["0px", "2px", "20px"],
                    opacity: [0, 1, 0],
                    scale: [1, 1, 2],
                }}
                transition={{
                    duration: 3,
                    repeat: Infinity,
                    ease: "easeInOut",
                }}
            >
                {children}
            </motion.span>
        </motion.h1>

    );
};

export default PulsingText;