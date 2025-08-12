import { Entity, Unique, PrimaryGeneratedColumn, Column, ManyToOne, Index, JoinColumn, OneToOne, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { User_definition } from './user_definition.entity';
import { Menu_definition } from './menu_definition.entity';

@Entity('extension_definition')
@Unique(['menu'])
export class Extension_definition {
    @PrimaryGeneratedColumn('increment')
    id: number;
    @Column({ type: "text", nullable: false })
    code: string;
    @Column({ type: "text", nullable: true })
    description: string;
    @Column({ type: "varchar", nullable: false })
    extensionId: string;
    @Column({ type: "boolean", nullable: false, default: true })
    isEnabled: boolean;
    @Column({ type: "boolean", nullable: false, default: false })
    isSystem: boolean;
    @Column({ type: "varchar", nullable: false })
    name: string;
    @Column({ type: "enum", nullable: false, default: "page", enum: ['page', 'widget'] })
    type: 'page' | 'widget';
    @Column({ type: "varchar", nullable: false, default: "1.0.0" })
    version: string;
    @Index()
    @ManyToOne('User_definition', { nullable: true, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    @JoinColumn()
    createdBy: any;
    @OneToOne('Menu_definition', (rel: any) => rel.extension, { nullable: true, cascade: true, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    @JoinColumn()
    menu: any;
    @Index()
    @ManyToOne('User_definition', { nullable: true, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    @JoinColumn()
    updatedBy: any;
    @CreateDateColumn()
    createdAt: Date;
    @UpdateDateColumn()
    updatedAt: Date;
}
