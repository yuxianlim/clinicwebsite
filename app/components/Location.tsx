const Location = () => {
  return (
    <section id="location" className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl font-bold text-center mb-12">联系我们</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <div className="mb-4">
              <h4 className="font-medium">营业时间</h4>
              <p>周一至周五: 9:00 - 18:00</p>
              <p>周六: 9:00 - 16:00</p>
              <p>周日: 休息</p>
            </div>
            <div className="mb-4">
              <h4 className="font-medium">地址</h4>
              <p>3150 Almaden Expy Ste 111, San Jose, CA 95118</p>
            </div>
            <div>
              <h4 className="font-medium">联系电话</h4>
              <p>(408) 555-1234</p>
            </div>
          </div>
          <div>
            <iframe
              src="https://maps.google.com/maps?q=3150%20Almaden%20Expy%20Ste%20111%20San%20Jose%20CA%2095118&output=embed"
              width="600"
              height="450"
              style={{ border: 0 }}
              allowFullScreen={true}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="w-full h-64 rounded-lg"
            ></iframe>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Location;