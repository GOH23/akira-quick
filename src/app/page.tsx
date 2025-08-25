import Image from "next/image";
import CTAButton from "./ui/CTAButton";
import { Loading } from "./ui/Loading";
import { TabsUI } from "./ui/TabsUi";
import SocialIcons from "./ui/SocialIcons";

export default function MainPage() {
  return (
    <main className="relative min-h-screen py-32  text-white overflow-x-hidden">
      <SocialIcons/>
      <TabsUI/>
      
    </main>

  );
}
