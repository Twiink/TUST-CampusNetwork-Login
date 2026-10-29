package com.netmate.app

import android.graphics.*
import android.graphics.drawable.Drawable
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.RippleDrawable
import android.content.res.ColorStateList

/** The palette and radii match src/constants/theme.ts; all drawing uses platform primitives. */
internal class NetMateAppearance(var dark: Boolean, private val density: Float) {
    val background get() = color(if(dark) "#0f172a" else "#f0f9ff")
    val backgroundEnd get() = color(if(dark) "#1e293b" else "#dbeafe")
    val text get() = color(if(dark) "#f1f5f9" else "#1e293b")
    val secondary get() = color(if(dark) "#94a3b8" else "#64748b")
    val primary get() = color(if(dark) "#38bdf8" else "#0ea5e9")
    val onPrimary get() = if(dark) background else Color.WHITE
    val card get() = color(if(dark) "#991e293b" else "#b3ffffff")
    val border get() = color(if(dark) "#4d38bdf8" else "#99ffffff")
    val success get() = color(if(dark) "#22c55e" else "#10b981")
    val danger get() = color("#ef4444")
    fun dp(value: Int) = (value*density+.5f).toInt()
    fun surface(radius: Int = 24, fill: Int = card): GradientDrawable = GradientDrawable().apply { cornerRadius=radius*density; setColor(fill); setStroke(dp(1),border) }
    fun button(primaryAction:Boolean=false, destructive:Boolean=false):Drawable {
        val fill=when{destructive -> color("#19ef4444");primaryAction -> primary;else -> card}
        return RippleDrawable(ColorStateList.valueOf((primary and 0x00ffffff) or 0x28000000),surface(16,fill),null)
    }
    fun background():Drawable=GradientDrawable(GradientDrawable.Orientation.TL_BR,intArrayOf(background,backgroundEnd))
    fun icon(kind:String,active:Boolean=false)=NetMateIcon(kind,if(active)primary else secondary,dp(24))
    private fun color(value:String)=Color.parseColor(value)
}

internal class NetMateIcon(private val kind:String,private val color:Int,private val size:Int):Drawable(){
    private val paint=Paint(Paint.ANTI_ALIAS_FLAG).apply{style=Paint.Style.STROKE;strokeWidth=1.8f;strokeCap=Paint.Cap.ROUND;strokeJoin=Paint.Join.ROUND}
    override fun draw(canvas:Canvas){val save=canvas.save();canvas.translate(bounds.left.toFloat(),bounds.top.toFloat());canvas.scale(bounds.width()/24f,bounds.height()/24f);paint.color=color;val p=Path()
        when(kind){
            "运行状态"->{p.moveTo(3f,10f);p.lineTo(12f,3f);p.lineTo(21f,10f);p.moveTo(5f,9f);p.lineTo(5f,21f);p.lineTo(10f,21f);p.lineTo(10f,14f);p.lineTo(14f,14f);p.lineTo(14f,21f);p.lineTo(19f,21f);p.lineTo(19f,9f)}
            "配置设置"->{canvas.drawCircle(12f,12f,4f,paint);canvas.drawCircle(12f,12f,8f,paint);for(i in 0..7){val a=i*Math.PI/4;canvas.drawLine((12+8*kotlin.math.cos(a)).toFloat(),(12+8*kotlin.math.sin(a)).toFloat(),(12+11*kotlin.math.cos(a)).toFloat(),(12+11*kotlin.math.sin(a)).toFloat(),paint)}}
            else->{p.moveTo(14f,3f);p.lineTo(5f,3f);p.lineTo(5f,21f);p.lineTo(19f,21f);p.lineTo(19f,8f);p.lineTo(14f,3f);p.lineTo(14f,8f);p.lineTo(19f,8f);p.moveTo(8f,13f);p.lineTo(16f,13f);p.moveTo(8f,17f);p.lineTo(16f,17f)}
        };canvas.drawPath(p,paint);canvas.restoreToCount(save)}
    override fun getIntrinsicWidth()=size;override fun getIntrinsicHeight()=size
    override fun setAlpha(alpha:Int){paint.alpha=alpha};override fun setColorFilter(filter:ColorFilter?){paint.colorFilter=filter}
    @Deprecated("Deprecated in Java")override fun getOpacity()=PixelFormat.TRANSLUCENT
}

/** The original sun/moon switch, drawn without images or a continuously running animation. */
internal class DayNightDrawable(private val dark:Boolean):Drawable(){
    private val paint=Paint(Paint.ANTI_ALIAS_FLAG)
    override fun draw(canvas:Canvas){val save=canvas.save();canvas.translate(bounds.left.toFloat(),bounds.top.toFloat());canvas.scale(bounds.width()/72f,bounds.height()/32f)
        canvas.clipPath(Path().apply{addRoundRect(0f,0f,72f,32f,16f,16f,Path.Direction.CW)})
        paint.color=Color.parseColor(if(dark)"#191e32" else "#4685c0");canvas.drawRoundRect(0f,0f,72f,32f,16f,16f,paint)
        if(dark){paint.color=Color.WHITE;for(point in arrayOf(12f to 9f,22f to 19f,30f to 8f))canvas.drawCircle(point.first,point.second,.9f,paint)}else{paint.color=0xffe0f2fe.toInt();canvas.drawCircle(55f,28f,12f,paint);canvas.drawCircle(66f,23f,10f,paint);canvas.drawCircle(40f,32f,10f,paint)}
        paint.color=Color.parseColor(if(dark)"#c3c8d2" else "#ffc323");val x=if(dark)56f else 16f;canvas.drawCircle(x,16f,12f,paint)
        if(dark){paint.color=0xff96a0b4.toInt();canvas.drawCircle(54f,12f,3f,paint);canvas.drawCircle(60f,19f,2f,paint);canvas.drawCircle(50f,20f,1.5f,paint)};canvas.restoreToCount(save)}
    override fun setAlpha(alpha:Int){paint.alpha=alpha};override fun setColorFilter(filter:ColorFilter?){paint.colorFilter=filter}
    @Deprecated("Deprecated in Java")override fun getOpacity()=PixelFormat.TRANSLUCENT
}
