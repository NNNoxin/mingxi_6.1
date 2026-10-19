/** 后台演示版每一页顶部的固定标记（docs/05 §12.5），避免与正式后台混淆。 */
export function DemoRibbon() {
  return (
    <div
      role="note"
      className="border-b border-warn/30 bg-warn-soft px-4 py-1.5 text-center text-[12px] text-warn"
    >
      <strong className="font-semibold">演示数据</strong>
      ：账号与记录都是虚构的，操作只在当前标签页里生效、不会保存，也不连接任何服务器。登录时邮箱和密码任意填写，验证码填任意
      6 位数字。
    </div>
  );
}
