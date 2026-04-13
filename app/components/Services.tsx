"use client";

import { useState } from 'react';

const Services = () => {
  const services = [
    { title: '针灸治疗', summary: '运用传统针灸技术激发身体自我修复，有效治疗颈椎病、腰椎病、头痛等多种疾病。', details: '针灸是中医的核心疗法，已有数千年的临床应用历史。我们的针灸医师运用精准的穴位定位和专业的针刺手法，刺激特定穴位，调理人体经络气血，促进循环系统功能恢复。针灸可有效治疗颈椎病、腰椎病、膝关节炎、头痛、失眠等多种常见疾病，同时具有调理身体、增强免疫力的作用。治疗全程无痛感或仅有微微酸胀感，安全可靠，无副作用。' },
    { title: '中药调理', summary: '根据体质辨证配制个性化中医方剂，从根本调理体质，改善亚健康和慢性病。', details: '中药调理遵循\"辨证论治\"原则，根据患者的体质特点、病情特征和舌象、脉象等诊断结果，精心配制个性化的中医处方。我们使用的中药均为精选的道地药材，经过严格的质量检测。中药调理通过调理脾胃功能、增强气血生成、改善体质等方式，从根本上解决慢性疾病问题。常见的调理方向包括亚健康调理、睡眠改善、更年期综合征、免疫力提升等。疗程因人而异，通常需要4-12周的持续调理。' },
    { title: '推拿按摩', summary: '专业手法治疗师通过穴位按摩和经络疏通，快速缓解颈肩腰腿痛、增加关节灵活性。', details: '推拿按摩是一门融诊断、治疗、保健于一体的手法疗法。我们的推拿师具有多年的临床经验，掌握正骨推拿、足部反射疗法、拔罐疗法等多种技术。通过针对性的手法操作，可以有效缓解肌肉紧张、增加关节灵活性、改善血液循环。特别适用于长期电脑工作导致的颈肩腰腿痛、运动损伤恢复、姿态矫正等问题。单次治疗通常需要30-60分钟，效果立竿见影。' },
    { title: '艾灸疗法', summary: '开发艾草温阳祛湿功效，温经活血，特别适合体质虚弱和寒湿体质患者的保健。', details: '艾灸是利用艾草燃烧产生的温热和药效，通过穴位刺激来调理身体的传统疗法。艾灸具有温阳祛湿、温经通络、扶正培元的功效，特别适合那些体质虚弱、容易疲劳、怕冷的患者。艾灸疗法可以促进新陈代谢、增强身体自我修复能力、改善微循环。常见的适应症包括宫寒导致的月经不调、体虚疲劳、关节冷痛等。定期艾灸还可作为预防保健手段，增强体质。' },
  ];

  const [selectedService, setSelectedService] = useState<typeof services[0] | null>(null);

  return (
    <section id="services" className="py-20 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl font-bold text-center mb-12">服务与治疗</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {services.map((service, index) => (
            <div
              key={index}
              onClick={() => setSelectedService(service)}
              className="bg-white p-6 rounded-lg shadow-md hover:shadow-2xl hover:scale-105 transition-all duration-300 cursor-pointer transform"
            >
              <h3 className="text-xl font-semibold mb-4 text-slate-800">{service.title}</h3>
              <p className="text-gray-600">{service.summary}</p>
            </div>
          ))}
        </div>
      </div>

      {selectedService && (
        <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setSelectedService(null)}>
          <div className="bg-white p-8 rounded-lg shadow-2xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-gray-800">{selectedService.title}</h2>
              <button
                onClick={() => setSelectedService(null)}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ×
              </button>
            </div>
            <p className="text-gray-600 mb-4">{selectedService.details}</p>
          </div>
        </div>
      )}
    </section>
  );
};

export default Services;